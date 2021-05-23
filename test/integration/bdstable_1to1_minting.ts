import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct, erc20ToNumber } from "../../utils/Helpers";
import { BDXShares } from "../../typechain/BDXShares";
import { BDStable } from "../../typechain/BDStable";
import * as constants from '../../utils/Constants'
import { provideLiquidity_WETH_BDEUR, updateWethPair} from "../helpers/swaps"
import { simulateTimeElapseInDays, simulateTimeElapseInSeconds, toErc20 } from "../../utils/Helpers"
import { WETH } from "../../typechain/WETH";
import { BdStablePool } from "../../typechain/BdStablePool";
import { ChainlinkBasedCryptoFiatFeed } from "../../typechain/ChainlinkBasedCryptoFiatFeed";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Uniswap Oracles", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    const oneHour = 60*60;

    it("should mint bdeur", async () => {
        const [ ownerUser ] = await hre.ethers.getSigners();

        const bdEurPool = await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;
        const bdEur = await hre.ethers.getContract('BDEUR', ownerUser) as unknown as BDStable;
        const bdx = await hre.ethers.getContract('BDXShares', ownerUser) as unknown as BDXShares;

        const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract(
            'ChainlinkBasedCryptoFiatFeed_WETH_EUR', 
            ownerUser) as unknown as ChainlinkBasedCryptoFiatFeed;
        
        const ethInEurPrice_1e12 = await chainlinkBasedCryptoFiatFeed_ETH_EUR.getPrice_1e12();
        const ethInEurPrice = ethInEurPrice_1e12.div(1e12).toNumber()

        const userLiquidityProvider = await hre.ethers.getNamedSigner('TEST1');
        await provideLiquidity_WETH_BDEUR(hre, 1, ethInEurPrice, userLiquidityProvider);

        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const weth = await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as unknown as WETH;

        await simulateTimeElapseInSeconds(oneHour*2);

        await updateWethPair(hre, "BDEUR");
        await bdEur.refreshCollateralRatio();

        await weth.connect(testUser).deposit({ value: toErc20(1000) });

        const collateralAmount = 10;
        await weth.connect(testUser).approve(bdEurPool.address, toErc20(collateralAmount));
        
        await bdEurPool.connect(testUser).mint1t1BD((toErc20(collateralAmount)), (toErc20(1)));

        const expected = ethInEurPrice_1e12.mul(toErc20(collateralAmount)).div(1e12);
        const actual = await bdEur.balanceOf(testUser.address);
        const diff = diffPct(actual, expected);

        console.log(`Diff: ${diff}%`);

        expect(diff).to.be.closeTo(0, 1);
    });
})