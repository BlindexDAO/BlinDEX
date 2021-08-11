import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { d12_ToNumber, diffPct, to_d12 } from "../../utils/Helpers";
import { to_d18, d18_ToNumber } from "../../utils/Helpers"
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { lockBdEuCrAt } from "../helpers/bdStable";
import { getBdEu, getBdx, getWeth, getBdEuWethPool } from "../helpers/common";
import { BigNumber } from "ethers";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";
import { initalBdStableToOwner_d18 } from "../../utils/Constants";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function performFractionalMinting(testUser: SignerWithAddress, collateralAmount_d18: BigNumber, bdxAmount_d18: BigNumber){
    const bdx = await getBdx(hre);
    const bdEuPool = await getBdEuWethPool(hre);
    const weth = await getWeth(hre);

    await weth.connect(testUser).approve(bdEuPool.address, collateralAmount_d18);
    await bdx.connect(testUser).approve(bdEuPool.address, bdxAmount_d18); 

    await bdEuPool.connect(testUser).mintFractionalBdStable(collateralAmount_d18, bdxAmount_d18, (to_d18(1)));
}

describe("BDStable fractional", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    it("should mint bdeu when CR > 0 & CR < 1", async () => {
        await setUpFunctionalSystem(hre);

        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEu = await getBdEu(hre);
        const bdEuPool = await getBdEuWethPool(hre);

        await lockBdEuCrAt(hre, 0.7);

        await bdx.transfer(testUser.address, to_d18(100)); // deployer gives some bdeu to user, so user can mint
        await bdEu.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeu to user, so user can mint

        const wethBalanceBeforeMinting_d18 = await weth.balanceOf(testUser.address);
        const bdEulBalanceBeforeMinting_d18 = await bdEu.balanceOf(testUser.address);
        const bdxlBalanceBeforeMinting_d18 = await bdx.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEuPool.getCollateralPrice_d12();
        const bdxPriceInWeth_d12 = BigNumber.from(1e12).mul(wethInEurPrice_d12).div(bdxInEurPrice_d12);

        // calculate how much is needed to mint
        const wethAmountForMintigBdEu_d18 = to_d18(0.1); // 70% of total value
        const bdxAmountForMintigBdEu_d18 = wethAmountForMintigBdEu_d18.mul(30).div(70).mul(bdxPriceInWeth_d12).div(1e12); // the remaining 30% of value

        const excessiveBdxAmountForMintigBdEu_d18 = bdxAmountForMintigBdEu_d18.mul(3); // the excess should be ignored
        await performFractionalMinting(testUser, wethAmountForMintigBdEu_d18, excessiveBdxAmountForMintigBdEu_d18);        
        
        // asserts
    
        const bdxBalanceAfterMinting_d18 = await bdx.balanceOf(testUser.address);
        const actualBdxCost_d18 = bdxlBalanceBeforeMinting_d18.sub(bdxBalanceAfterMinting_d18);  
        const diffPctBdxCost = diffPct(actualBdxCost_d18, bdxAmountForMintigBdEu_d18);
        console.log(`Diff BDX cost: ${diffPctBdxCost}%`);
        expect(diffPctBdxCost).to.be.closeTo(0, 0.1);

        const wethBalanceAfterMinging_d18 = await weth.balanceOf(testUser.address);
        const actualWethCost_d18 = wethBalanceBeforeMinting_d18.sub(wethBalanceAfterMinging_d18);
        const diffPctWethBalance = diffPct(actualWethCost_d18, wethAmountForMintigBdEu_d18);
        console.log(`Diff Weth balance: ${diffPctWethBalance}%`);
        expect(diffPctWethBalance).to.be.closeTo(0, 0.1);

        const bdEuFromBdx_d18 = bdxAmountForMintigBdEu_d18.mul(bdxInEurPrice_d12).div(1e12);
        const bdEuFromWeth_d18 = wethAmountForMintigBdEu_d18.mul(wethInEurPrice_d12).div(1e12);
        const expectedBdEuDiff_d18 = bdEuFromBdx_d18.add(bdEuFromWeth_d18);
        const bdEuBalanceAfterMinting_d18 = await bdEu.balanceOf(testUser.address);
        const diffPctBdEu = diffPct(bdEuBalanceAfterMinting_d18.sub(bdEulBalanceBeforeMinting_d18), expectedBdEuDiff_d18);
        console.log(`Diff BdEu balance: ${diffPctBdEu}%`);
        expect(diffPctBdEu).to.be.closeTo(0, 0.1);
    });

    it("should redeem bdeu when CR > 0 & CR < 1 & efCR > CR", async () => {
        await setUpFunctionalSystem(hre, 0.9); // low initial collateralization so efCR is low (for test purposes)

        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEu = await getBdEu(hre);
        const bdEuPool = await getBdEuWethPool(hre);

        const cr = 0.7;

        await lockBdEuCrAt(hre, cr);   

        const efCR_d12 = await bdEu.effective_global_collateral_ratio_d12();
        console.log("effectiveCR: " + d12_ToNumber(efCR_d12));
        expect(d12_ToNumber(efCR_d12)).to.be.gt(cr, "we want efCR > CR, for test purposes"); // test valitation

        await bdx.transfer(testUser.address, to_d18(100)); // deployer gives some bdeu to user, so user can redeem
        await bdEu.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeu to user, so user can redeem

        const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(testUser.address);
        const bdxBalanceBeforeRedeem_d18 = await bdx.balanceOf(testUser.address);
        const wethBalanceBeforeRedeem_d18 = await weth.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEuPool.getCollateralPrice_d12();

        const bdEuToRedeem_d18 = to_d18(100);

        // calculate how much is needed to mint
        const expectedWethRedeemingCost_d18 = bdEuToRedeem_d18
            // .mul(to_d12(cr)).div(1e12)
            .mul(70).div(100)
            .mul(1e12).div(wethInEurPrice_d12);

        const expectedBdxRedeemingCost_d18 = bdEuToRedeem_d18
            .mul(to_d12(1-cr)).div(1e12)
            .mul(1e12).div(bdxInEurPrice_d12);

        await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem_d18);
        await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 1);
        await bdEuPool.connect(testUser).collectRedemption();
        
        // asserts

        const bdEuBalanceAfterRedeem_d18 = await bdEu.balanceOf(testUser.address);
        console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem_d18));
        expect(bdEuBalanceAfterRedeem_d18).to.eq(bdEuBalanceBeforeRedeem_d18.sub(bdEuToRedeem_d18), "unexpected bdEu balance");
        
        const wethBalanceAfterRedeem_d18 = await weth.balanceOf(testUser.address);
        const wethDelta_d18 = wethBalanceAfterRedeem_d18.sub(wethBalanceBeforeRedeem_d18);
        const wethDiffPct = diffPct(expectedWethRedeemingCost_d18, wethDelta_d18);
        console.log("expected weth redeeming cost: " + expectedWethRedeemingCost_d18);
        console.log("weth balance delta:           " + wethDelta_d18);
        console.log("weth diff pct:                " + wethDiffPct);
        expect(wethDiffPct).to.be.closeTo(0, 0.0001, "unexpected weth balance");
        
        const bdxBalanceAfterRedeem_d18 = await bdx.balanceOf(testUser.address);
        const bdxDelta_d18 = bdxBalanceAfterRedeem_d18.sub(bdxBalanceBeforeRedeem_d18);
        const bdxDiffPct = diffPct(expectedBdxRedeemingCost_d18, bdxDelta_d18);
        console.log("expected bdx balance delta: " + expectedBdxRedeemingCost_d18);
        console.log("bdx balance delta:          " + bdxDelta_d18);
        console.log("bdx diff pct:               " + bdxDiffPct);
        expect(bdxDiffPct).to.be.closeTo(0, 0.0001, "unexpected bdx balance");
    });

    it("should redeem bdeu when CR > 0 & CR < 1 & efCR < CR", async () => {
        await setUpFunctionalSystem(hre, 0.4); // low initial collateralization so efCR is low (for test purposes)

        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEu = await getBdEu(hre);
        const bdEuPool = await getBdEuWethPool(hre);

        const cr = 0.7;

        await lockBdEuCrAt(hre, cr);   

        const efCR_d12 = await bdEu.effective_global_collateral_ratio_d12();
        console.log("effectiveCR: " + d12_ToNumber(efCR_d12));
        expect(d12_ToNumber(efCR_d12)).to.be.lt(cr, "we want efCR < CR, for test purposes"); // test valitation

        await bdx.transfer(testUser.address, to_d18(100)); // deployer gives some bdeu to user, so user can redeem
        await bdEu.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeu to user, so user can redeem

        const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(testUser.address);
        const bdxBalanceBeforeRedeem_d18 = await bdx.balanceOf(testUser.address);
        const wethBalanceBeforeRedeem_d18 = await weth.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEuPool.getCollateralPrice_d12();

        const bdEuToRedeem_d18 = to_d18(100);

        // calculate how much is needed to mint
        const expectedWethRedeemingCost_d18 = bdEuToRedeem_d18
            .mul(efCR_d12).div(1e12)
            .mul(1e12).div(wethInEurPrice_d12);

        const expectedBdxRedeemingCost_d18 = bdEuToRedeem_d18
            .mul(to_d12(1).sub(efCR_d12)).div(1e12)
            .mul(1e12).div(bdxInEurPrice_d12);

        await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem_d18);
        await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 1);
        await bdEuPool.connect(testUser).collectRedemption();
        
        // asserts

        const bdEuBalanceAfterRedeem_d18 = await bdEu.balanceOf(testUser.address);
        console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem_d18));
        expect(bdEuBalanceAfterRedeem_d18).to.eq(bdEuBalanceBeforeRedeem_d18.sub(bdEuToRedeem_d18), "unexpected bdEu balance");
        
        const wethBalanceAfterRedeem_d18 = await weth.balanceOf(testUser.address);
        const wethDelta_d18 = wethBalanceAfterRedeem_d18.sub(wethBalanceBeforeRedeem_d18);
        const wethDiffPct = diffPct(expectedWethRedeemingCost_d18, wethDelta_d18);
        console.log("expected weth redeeming cost: " + expectedWethRedeemingCost_d18);
        console.log("weth balance delta:           " + wethDelta_d18);
        console.log("weth diff pct:                " + wethDiffPct);
        expect(wethDiffPct).to.be.closeTo(0, 0.0001, "unexpected weth balance");
        
        const bdxBalanceAfterRedeem_d18 = await bdx.balanceOf(testUser.address);
        const bdxDelta_d18 = bdxBalanceAfterRedeem_d18.sub(bdxBalanceBeforeRedeem_d18);
        const bdxDiffPct = diffPct(expectedBdxRedeemingCost_d18, bdxDelta_d18);
        console.log("expected bdx balance delta: " + expectedBdxRedeemingCost_d18);
        console.log("bdx balance delta:          " + bdxDelta_d18);
        console.log("bdx diff pct:               " + bdxDiffPct);
        expect(bdxDiffPct).to.be.closeTo(0, 0.0001, "unexpected bdx balance");
    });
})
