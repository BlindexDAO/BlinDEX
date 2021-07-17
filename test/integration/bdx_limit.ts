import hre, { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { bigNumberToDecimal, d12_ToNumber, d18_ToNumber, diffPct, to_d12, to_d18, to_d8 } from "../../utils/Helpers";
import { getBdEur, getBdEurWbtcPool, getBdEurWethPool, getBdx, getUniswapRouter, getDeployer, getOnChainBtcEurPrice, getOnChainEthEurPrice, getUser, getWbtc, getWeth, mintWbtc as mintWbtcFromEth } from "../helpers/common";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import { swapForWethAsDeployer } from "../helpers/swaps";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BDX limit", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystem(hre);
    });

    it.only("should mint max total supply of BDX", async () => {
        const bdEur = await getBdEur(hre);
        const bdx = await getBdx(hre);
        const bdEurWethPool = await getBdEurWethPool(hre);
        const uniswapRouter = await getUniswapRouter(hre);
        const weth = await getWeth(hre);
        const deployer = getDeployer(hre);

        const owner = await getDeployer(hre);

        const bdxAvailableToMint = await bdx.howMuchCanBeMinted();
        const bdxLeftForUser = to_d18(1);
        const bdxToBeMintedByOwner = bdxAvailableToMint.sub(bdxLeftForUser);

        expect(bdxToBeMintedByOwner).to.be.gt(0, "invalid bdxToBeMintedByOwner"); // test validation

        await bdx.mint(ethers.constants.AddressZero, owner.address, bdxToBeMintedByOwner);

        await bdEur.lockCollateralRationAt(0);
        const [wethInLiquidity_d18, bdxInLiquidity_d18] = await uniswapRouter.getReserves(weth.address, bdx.address);

        console.log("-----------------wethInLiquidity: " + d18_ToNumber(wethInLiquidity_d18));
        console.log("-----------------bdxInLiquidity:  " + d18_ToNumber(bdxInLiquidity_d18));

        const bdxIn = d18_ToNumber(wethInLiquidity_d18) * 10;

        await bdx.mint(ethers.constants.AddressZero, (await deployer).address, bdxIn);

        await swapForWethAsDeployer(hre, "BDXShares", bdxIn, 1);

        const [wethInLiquidityAfter_d18, bdxInLiquidityAfter_d18] = await uniswapRouter.getReserves(weth.address, bdx.address);

        console.log("-----------------wethInLiquidityAfter: " + d18_ToNumber(wethInLiquidityAfter_d18));
        console.log("-----------------bdxInLiquidityAfter:  " + d18_ToNumber(bdxInLiquidityAfter_d18));

        // await DecreaseCollateralizationAndWait();
    });

    it("should NOT exceed max total supply of BDX", async () => {
        expect(1).to.be.eq(2, "safety fail");
    });
});