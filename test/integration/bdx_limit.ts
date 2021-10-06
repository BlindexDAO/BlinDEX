import hre, { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { d18_ToNumber, diffPct, to_d12, to_d18 } from "../../utils/Helpers";
import { getBdEu, getBdEuWethPool, getBdx, getDeployer, getUser } from "../helpers/common";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";
import { simulateTimeElapseInDays } from "../../utils/HelpersHardhat";
import { swapForWethAsDeployer } from "../helpers/swaps";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BDX limit", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystem(hre);
    });

    it("should mint max total supply of BDX", async () => {

        const bdEuAvailableToRedeem_d18 = await arrange();

        const bdEu = await getBdEu(hre);
        const bdx = await getBdx(hre);
        const bdEuWethPool = await getBdEuWethPool(hre);

        const user = await getUser(hre);

        const bdxMaxTotalSupply_d18 = await bdx.MAX_TOTAL_SUPPLY();

        await bdEu.transfer(user.address, bdEuAvailableToRedeem_d18);
        const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(user.address);
        const bdxTotalSupplyBeforeRedeem_d18 = await bdx.totalSupply();

        await bdEu.connect(user).approve(bdEuWethPool.address, bdEuAvailableToRedeem_d18);
        await bdEuWethPool.connect(user).redeemAlgorithmicBdStable(bdEuAvailableToRedeem_d18, 1);

        const bdEuBalanceAfterRedeem_d18 = await bdEu.balanceOf(user.address);

        const bdEuBalanceDiff_d18 = bdEuBalanceBeforeRedeem_d18.sub(bdEuBalanceAfterRedeem_d18);

        const buredBdEuPctDiff = diffPct(bdEuAvailableToRedeem_d18, bdEuBalanceDiff_d18);

        const bdxTotalSupplyAfterRedeem_d18 = await bdx.totalSupply();

        expect(bdxTotalSupplyAfterRedeem_d18).to.be.gt(
            bdxTotalSupplyBeforeRedeem_d18,
            "some bdx must have been collected in redemption"); // test validation

        const bdxNotMintedYet = bdxMaxTotalSupply_d18.sub(bdxTotalSupplyBeforeRedeem_d18);
        const bdxNotMintedYetMinusRedemptionFee = bdxNotMintedYet.mul(to_d12(1-0.0025)).div(1e12) // decrease (the part that hasn't been minted yet) by redemption fee
        const expectedTotalMintedBdx = bdxTotalSupplyBeforeRedeem_d18.add(bdxNotMintedYetMinusRedemptionFee);
        const bdxTotalSupplyDiffPct = diffPct(bdxTotalSupplyAfterRedeem_d18, expectedTotalMintedBdx);

        expect(buredBdEuPctDiff).to.be.closeTo(0, 0.001,
            "unexpected bdEu amount burned");

        expect(bdxTotalSupplyDiffPct).to.be.closeTo(0, 0.001,
            "unexpected amount of bdx minted");
    });

    // redeeming x2 more bdEu, recieiving the same amount od bdx
    it("should NOT exceed max total supply of BDX", async () => {
        const bdEuAvailableToRedeem_d18 = await arrange();
        const bdEuToRedeem_d18 = bdEuAvailableToRedeem_d18.mul(2); 

        const bdEu = await getBdEu(hre);
        const bdx = await getBdx(hre);
        const bdEuWethPool = await getBdEuWethPool(hre);

        const user = await getUser(hre);

        const bdxMaxTotalSupply_d18 = await bdx.MAX_TOTAL_SUPPLY();

        await bdEu.transfer(user.address, bdEuToRedeem_d18);
        const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(user.address);
        const bdxTotalSupplyBeforeRedeem_d18 = await bdx.totalSupply();

        await bdEu.connect(user).approve(bdEuWethPool.address, bdEuToRedeem_d18);
        await bdEuWethPool.connect(user).redeemAlgorithmicBdStable(bdEuToRedeem_d18, 1);

        const bdEuBalanceAfterRedeem_d18 = await bdEu.balanceOf(user.address);

        const bdEuBalanceDiff_d18 = bdEuBalanceBeforeRedeem_d18.sub(bdEuBalanceAfterRedeem_d18);

        const buredBdEuPctDiff = diffPct(bdEuToRedeem_d18, bdEuBalanceDiff_d18);

        const bdxTotalSupplyAfterRedeem_d18 = await bdx.totalSupply();

        expect(bdxTotalSupplyAfterRedeem_d18).to.be.gt(
            bdxTotalSupplyBeforeRedeem_d18,
            "some bdx must have been collected in redemption"); // test validation

        const bdxTotalSupplyDiffPct = diffPct(bdxTotalSupplyAfterRedeem_d18, bdxMaxTotalSupply_d18);

        console.log("bdEu blance diff: " + d18_ToNumber(bdEuBalanceDiff_d18));
        console.log("bdxTotalSupplyBefore: " + d18_ToNumber(bdxTotalSupplyBeforeRedeem_d18));
        console.log("bdxTotalSupplyAfter: " + d18_ToNumber(bdxTotalSupplyAfterRedeem_d18));
        console.log("bdx total supply, max supply diff %: " + bdxTotalSupplyDiffPct);

        expect(buredBdEuPctDiff).to.be.closeTo(0, 0.01,
            "unexpected bdEu amount burned");

        expect(bdxTotalSupplyDiffPct).to.be.closeTo(0, 0.01,
            "unexpected amount of bdx minted");
    });

    async function arrange(){
        const bdEu = await getBdEu(hre);
        const bdx = await getBdx(hre);
        const owner = await getDeployer(hre);

        const bdxAvailableToMint = await bdx.howMuchCanBeMinted();
        const bdxLeftForUser = to_d18(9 * 1e6); // 9 mln available for the user to mint
        const bdxToBeMintedByOwner = bdxAvailableToMint.sub(bdxLeftForUser);

        expect(bdxToBeMintedByOwner).to.be.gt(1e6, "invalid bdxToBeMintedByOwner, must be at least 1e6 for a swap"); // test validation

        await bdx.mint(ethers.constants.AddressZero, owner.address, bdxToBeMintedByOwner);

        // we lock CR at 0 to be able to redeem, bdEu for bdx only
        await bdEu.lockCollateralRatioAt(0);

        // we swap a big number of bdx for weth on low liquidity pool, to drive bdx price down
        // we need cheap bdx to be able to mint all of BDX supply when redeeming our bdEu
        const bdxIn = 1e6; // just a big number to bring bdx/weth price down in the oracle
        await swapForWethAsDeployer(hre, "BDXShares", bdxIn, 1e-18);
        await simulateTimeElapseInDays(1);
        await bdEu.updateOraclesIfNeeded();

        const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
        const bdxTotalSupplyBeforeRedeem_d18 = await bdx.totalSupply();
        const bdxMaxTotalSupply_d18 = await bdx.MAX_TOTAL_SUPPLY();

        const bdxLeftToMint_d18 = bdxMaxTotalSupply_d18.sub(bdxTotalSupplyBeforeRedeem_d18);
        
        const bdEuAvailableToRedeem_d18 = bdxLeftToMint_d18.mul(bdxInEurPrice_d12).div(1e12);

        return bdEuAvailableToRedeem_d18;
    }
});