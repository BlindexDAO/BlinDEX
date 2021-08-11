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

    it("should mint max total supply of BDX", async () => {

        const bdEurAvailableToRedeem_d18 = await arrange();

        const bdEur = await getBdEur(hre);
        const bdx = await getBdx(hre);
        const bdEurWethPool = await getBdEurWethPool(hre);

        const user = await getUser(hre);

        const bdxMaxTotalSupply_d18 = await bdx.MAX_TOTAL_SUPPLY();

        await bdEur.transfer(user.address, bdEurAvailableToRedeem_d18);
        const bdEurBalanceBeforeRedeem_d18 = await bdEur.balanceOf(user.address);
        const bdxTotalSupplyBeforeRedeem_d18 = await bdx.totalSupply();

        await bdEur.connect(user).approve(bdEurWethPool.address, bdEurAvailableToRedeem_d18);
        await bdEurWethPool.connect(user).redeemAlgorithmicBdStable(bdEurAvailableToRedeem_d18, 1);

        const bdEurBalanceAfterRedeem_d18 = await bdEur.balanceOf(user.address);

        const bdEurBalanceDiff_d18 = bdEurBalanceBeforeRedeem_d18.sub(bdEurBalanceAfterRedeem_d18);

        const buredBdEurPctDiff = diffPct(bdEurAvailableToRedeem_d18, bdEurBalanceDiff_d18);

        const bdxTotalSupplyAfterRedeem_d18 = await bdx.totalSupply();

        expect(bdxTotalSupplyAfterRedeem_d18).to.be.gt(
            bdxTotalSupplyBeforeRedeem_d18,
            "some bdx must have been collected in redemption"); // test validation

        const bdxTotalSupplyDiffPct = diffPct(bdxTotalSupplyAfterRedeem_d18, bdxMaxTotalSupply_d18);

        console.log("bdEur blance diff: " + d18_ToNumber(bdEurBalanceDiff_d18));
        console.log("bdxTotalSupplyBefore: " + d18_ToNumber(bdxTotalSupplyBeforeRedeem_d18));
        console.log("bdxTotalSupplyAfter: " + d18_ToNumber(bdxTotalSupplyAfterRedeem_d18));
        console.log("bdx total supply, max supply diff %: " + bdxTotalSupplyDiffPct);

        expect(buredBdEurPctDiff).to.be.closeTo(0, 0.01,
            "unexpected bdEur amount burned");

        expect(bdxTotalSupplyDiffPct).to.be.closeTo(0, 0.01,
            "unexpected amount of bdx minted");
    });

    // redeeming x2 more bdEur, recieiving the same amount od bdx
    it("should NOT exceed max total supply of BDX", async () => {
        const bdEurAvailableToRedeem_d18 = await arrange();
        const bdEurToRedeem_d18 = bdEurAvailableToRedeem_d18.mul(2); 

        const bdEur = await getBdEur(hre);
        const bdx = await getBdx(hre);
        const bdEurWethPool = await getBdEurWethPool(hre);

        const user = await getUser(hre);

        const bdxMaxTotalSupply_d18 = await bdx.MAX_TOTAL_SUPPLY();

        await bdEur.transfer(user.address, bdEurToRedeem_d18);
        const bdEurBalanceBeforeRedeem_d18 = await bdEur.balanceOf(user.address);
        const bdxTotalSupplyBeforeRedeem_d18 = await bdx.totalSupply();

        await bdEur.connect(user).approve(bdEurWethPool.address, bdEurToRedeem_d18);
        await bdEurWethPool.connect(user).redeemAlgorithmicBdStable(bdEurToRedeem_d18, 1);

        const bdEurBalanceAfterRedeem_d18 = await bdEur.balanceOf(user.address);

        const bdEurBalanceDiff_d18 = bdEurBalanceBeforeRedeem_d18.sub(bdEurBalanceAfterRedeem_d18);

        const buredBdEurPctDiff = diffPct(bdEurToRedeem_d18, bdEurBalanceDiff_d18);

        const bdxTotalSupplyAfterRedeem_d18 = await bdx.totalSupply();

        expect(bdxTotalSupplyAfterRedeem_d18).to.be.gt(
            bdxTotalSupplyBeforeRedeem_d18,
            "some bdx must have been collected in redemption"); // test validation

        const bdxTotalSupplyDiffPct = diffPct(bdxTotalSupplyAfterRedeem_d18, bdxMaxTotalSupply_d18);

        console.log("bdEur blance diff: " + d18_ToNumber(bdEurBalanceDiff_d18));
        console.log("bdxTotalSupplyBefore: " + d18_ToNumber(bdxTotalSupplyBeforeRedeem_d18));
        console.log("bdxTotalSupplyAfter: " + d18_ToNumber(bdxTotalSupplyAfterRedeem_d18));
        console.log("bdx total supply, max supply diff %: " + bdxTotalSupplyDiffPct);

        expect(buredBdEurPctDiff).to.be.closeTo(0, 0.01,
            "unexpected bdEur amount burned");

        expect(bdxTotalSupplyDiffPct).to.be.closeTo(0, 0.01,
            "unexpected amount of bdx minted");
    });

    async function arrange(){
        const bdEur = await getBdEur(hre);
        const bdx = await getBdx(hre);
        const owner = await getDeployer(hre);

        const bdxAvailableToMint = await bdx.howMuchCanBeMinted();
        const bdxLeftForUser = to_d18(9 * 1e6); // 9 mln available for the user to mint
        const bdxToBeMintedByOwner = bdxAvailableToMint.sub(bdxLeftForUser);

        expect(bdxToBeMintedByOwner).to.be.gt(1e6, "invalid bdxToBeMintedByOwner, must be at least 1e6 for a swap"); // test validation

        await bdx.mint(ethers.constants.AddressZero, owner.address, bdxToBeMintedByOwner);

        // we lock CR at 0 to be able to redeem, bdEur for bdx only
        await bdEur.lockCollateralRatioAt(0);

        // we swap a big number of bdx for weth on low liquidity pool, to drive bdx price down
        // we need cheap bdx to be able to mint all of BDX supply when redeeming our bdEur
        const bdxIn = 1e6; // just a big number to bring bdx/weth price down in the oracle
        await swapForWethAsDeployer(hre, "BDXShares", bdxIn, 1e-18);
        await simulateTimeElapseInDays(1);
        await bdEur.updateOraclesIfNeeded();

        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        const bdxTotalSupplyBeforeRedeem_d18 = await bdx.totalSupply();
        const bdxMaxTotalSupply_d18 = await bdx.MAX_TOTAL_SUPPLY();

        const bdxLeftToMint_d18 = bdxMaxTotalSupply_d18.sub(bdxTotalSupplyBeforeRedeem_d18);
        
        const bdEurAvailableToRedeem_d18 = bdxLeftToMint_d18.mul(bdxInEurPrice_d12).div(1e12);

        return bdEurAvailableToRedeem_d18;
    }
});