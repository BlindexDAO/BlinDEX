import hre, { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { bigNumberToDecimal, d12_ToNumber, d18_ToNumber, diffPct, to_d12, to_d18, to_d8 } from "../../utils/Helpers";
import { getBdEur, getBdEurWbtcPool, getBdEurWethPool, getBdx, getUniswapRouter, getDeployer, getOnChainBtcEurPrice, getOnChainEthEurPrice, getUser, getWbtc, getWeth, mintWbtc as mintWbtcFromEth } from "../helpers/common";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";
import { simulateTimeElapseInDays, simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import { swapForWethAsDeployer, swapAsDeployerByContract } from "../helpers/swaps";

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
        const user = await getUser(hre);

        const owner = await getDeployer(hre);

        const bdxAvailableToMint = await bdx.howMuchCanBeMinted();
        const bdxLeftForUser = to_d18(9 * 1e6); // 9 mln available for the user to mint
        const bdxToBeMintedByOwner = bdxAvailableToMint.sub(bdxLeftForUser);

        expect(bdxToBeMintedByOwner).to.be.gt(0, "invalid bdxToBeMintedByOwner"); // test validation

        await bdx.mint(ethers.constants.AddressZero, owner.address, bdxToBeMintedByOwner);

        await bdEur.lockCollateralRationAt(0);
        const [wethInLiquidityBefore_d18, bdxInLiquidityBefore_d18] = await uniswapRouter.getReserves(weth.address, bdx.address);

        console.log("wethInLiquidity: " + d18_ToNumber(wethInLiquidityBefore_d18));
        console.log("bdxInLiquidity:  " + d18_ToNumber(bdxInLiquidityBefore_d18));

        const bdxIn = 1e6; // just a big number to bring bdx/weth price down in the oracle

        await bdx.mint(ethers.constants.AddressZero, owner.address, bdxIn);

        const bdxInEurPriceBefore_d12 = await bdEur.BDX_price_d12();

        await swapForWethAsDeployer(hre, "BDXShares", bdxIn, 1e-18);
        await simulateTimeElapseInDays(1);
        await bdEur.updateOraclesIfNeeded();

        const [bdxInLiquidityAfter_d18, bdEurInLiquidityAfter_d18] = await uniswapRouter.getReserves(bdx.address, bdEur.address);

        console.log("bdxInLiquidityAfter_d18:  " + d18_ToNumber(bdxInLiquidityAfter_d18));
        console.log("bdEurInLiquidityAfter_d18: " + d18_ToNumber(bdEurInLiquidityAfter_d18));

        const bdxInEurPriceAfter_d12 = await bdEur.BDX_price_d12();
        const bdxTotalSupplyBefore_d18 = await bdx.totalSupply();
        const bdxMaxTotalSupply_d18 = await bdx.MAX_TOTAL_SUPPLY();

        const bdxLeftToMint_d18 = bdxMaxTotalSupply_d18.sub(bdxTotalSupplyBefore_d18);
        
        const expectedBdEurPossibleToRedeem_d18 = bdxLeftToMint_d18.mul(bdxInEurPriceAfter_d12).div(1e12);
        console.log("bdxLeftToMint_d18: " + bdxLeftToMint_d18);
        console.log("bdxInEurPriceBefore_d12: " + bdxInEurPriceBefore_d12);
        console.log("bdxInEurPriceAfter_d12: " + bdxInEurPriceAfter_d12);
        console.log("expectedBdEurPossibleToRedeem_d18: " + expectedBdEurPossibleToRedeem_d18);

        await bdEur.transfer(user.address, expectedBdEurPossibleToRedeem_d18);

        const bdEurlBalanceBefore_d18 = await bdEur.balanceOf(user.address);

        await bdEur.connect(user).approve(bdEurWethPool.address, expectedBdEurPossibleToRedeem_d18);
        await bdEurWethPool.connect(user).redeemAlgorithmicBdStable(expectedBdEurPossibleToRedeem_d18, 1);

        const bdEurlBalanceAfter_d18 = await bdEur.balanceOf(user.address);

        const bdEurBalanceDiff_d18 = bdEurlBalanceAfter_d18.sub(bdEurlBalanceBefore_d18);

        const mintedBdEurPctDiff = diffPct(bdEurBalanceDiff_d18, expectedBdEurPossibleToRedeem_d18);

        console.log("bdEurlBalanceBefore_d18: " + bdEurlBalanceBefore_d18);
        console.log("bdEurlBalanceAfter_d18: " + bdEurlBalanceAfter_d18);
        console.log("bdEurBalanceDiff_d18: " + bdEurBalanceDiff_d18);
        console.log("mintedBdEurPctDiff: " + mintedBdEurPctDiff);

        const bdxTotalSupplyAfter_d18 = await bdx.totalSupply();
        const bdxTotalSupplyDiffPct = diffPct(bdxTotalSupplyAfter_d18, bdxMaxTotalSupply_d18);

        console.log("bdxTotalSupplyBefore: " + d18_ToNumber(bdxTotalSupplyBefore_d18));
        console.log("bdxTotalSupplyAfter: " + d18_ToNumber(bdxTotalSupplyAfter_d18));
        console.log("bdxTotalSupplyDiffPct: " + bdxTotalSupplyDiffPct);

        expect(bdxTotalSupplyAfter_d18).to.be.gt(
            bdxTotalSupplyBefore_d18,
            "some bdx must have been collected in redemption"); // test validation

        expect(bdxTotalSupplyDiffPct).to.be.closeTo(0, 0.01);
    });

    it("should NOT exceed max total supply of BDX", async () => {
        expect(1).to.be.eq(2, "safety fail");
    });
});