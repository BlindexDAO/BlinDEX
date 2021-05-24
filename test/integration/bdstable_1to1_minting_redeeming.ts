import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct } from "../../utils/Helpers";
import { BDStable } from "../../typechain/BDStable";
import * as constants from '../../utils/Constants'
import { provideLiquidity_WETH_BDEUR, updateWethPair} from "../helpers/swaps"
import { simulateTimeElapseInSeconds, toErc20 } from "../../utils/Helpers"
import { WETH } from "../../typechain/WETH";
import { BdStablePool } from "../../typechain/BdStablePool";
import { ChainlinkBasedCryptoFiatFeed } from "../../typechain/ChainlinkBasedCryptoFiatFeed";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

const oneHour = 60*60;

async function getBdEur(){
    const [ ownerUser ] = await hre.ethers.getSigners();
    return await hre.ethers.getContract('BDEUR', ownerUser) as unknown as BDStable;
}

async function provideLiqidity(eurToEth: number){
    const userLiquidityProvider = await hre.ethers.getNamedSigner('TEST1');

    await provideLiquidity_WETH_BDEUR(hre, 1, eurToEth, userLiquidityProvider);
}

async function refreshRatios(){
    await simulateTimeElapseInSeconds(oneHour*2);

    await updateWethPair(hre, "BDEUR");

    const bdEur = await getBdEur();
    await bdEur.refreshCollateralRatio();
}

async function performMinting(testUser: SignerWithAddress, collateralAmount: number){
    const [ ownerUser ] = await hre.ethers.getSigners();

    const bdEurPool = await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;

    await refreshRatios();

    const weth = await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as unknown as WETH;
    await weth.connect(testUser).deposit({ value: toErc20(1000) });

    await weth.connect(testUser).approve(bdEurPool.address, toErc20(collateralAmount));
    
    await bdEurPool.connect(testUser).mint1t1BD((toErc20(collateralAmount)), (toErc20(1)));
}

async function getOnChainEthEurPrice(){
    const [ ownerUser ] = await hre.ethers.getSigners();

    const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract(
        'ChainlinkBasedCryptoFiatFeed_WETH_EUR', 
        ownerUser) as unknown as ChainlinkBasedCryptoFiatFeed;
    
    const ethInEurPrice_1e12 = await chainlinkBasedCryptoFiatFeed_ETH_EUR.getPrice_1e12();
    const ethInEurPrice = ethInEurPrice_1e12.div(1e12).toNumber();

    return {ethInEurPrice_1e12, ethInEurPrice};
}

describe("BDStable 1to1", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    it("should mint bdeur when CR close to 1", async () => {
        const bdEur = await getBdEur();

        const { ethInEurPrice_1e12, ethInEurPrice } = await getOnChainEthEurPrice();

        const testUser = await hre.ethers.getNamedSigner('TEST2');
        const collateralAmount = 10;

        await provideLiqidity(ethInEurPrice);
        await performMinting(testUser, collateralAmount);

        const expected = ethInEurPrice_1e12.mul(toErc20(collateralAmount)).div(1e12);
        const actual = await bdEur.balanceOf(testUser.address);
        const diff = diffPct(actual, expected);

        console.log(`Diff: ${diff}%`);

        expect(diff).to.be.closeTo(0, 1);
    });

    it("minting should throw when CR > 1", async () => {
        const { ethInEurPrice_1e12, ethInEurPrice } = await getOnChainEthEurPrice();

        const testUser = await hre.ethers.getNamedSigner('TEST2');
        const collateralAmount = 10;

        await provideLiqidity(ethInEurPrice * 0.5);
        
        // refresh ratios a couple times to CR has chance to change
        await refreshRatios();
        await refreshRatios();
        await refreshRatios();

        await expect((async () => {
            await (await performMinting(testUser, collateralAmount))
        })()).to.be.rejectedWith("revert Collateral ratio must be >= 1");
    });

    it("should redeem bdeur when CR close to 1", async () => {
        expect(1).to.eq(2);
    });

    it("redeeming should throw when CR != 1", async () => {
        expect(1).to.eq(2);
        //fail with: "Collateral ratio must be == 1"
    });
})