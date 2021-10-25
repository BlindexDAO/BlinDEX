import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { d12_ToNumber, diffPct, to_d12, to_d8 } from "../../utils/Helpers";
import { to_d18, d18_ToNumber } from "../../utils/Helpers"
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { lockBdEuCrAt } from "../helpers/bdStable";
import { getBdEu, getBdx, getWeth, getBdEuWethPool, getTreasury, getDeployer } from "../helpers/common";
import { BigNumber } from "ethers";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function performFractionalMinting(testUser: SignerWithAddress, wethAmount_d18: BigNumber, bdxAmount_d18: BigNumber){
    const bdx = await getBdx(hre);
    const bdEuPool = await getBdEuWethPool(hre);
    const weth = await getWeth(hre);

    await weth.connect(testUser).approve(bdEuPool.address, wethAmount_d18);
    await bdx.connect(testUser).approve(bdEuPool.address, bdxAmount_d18); 

    await bdEuPool.connect(testUser).mintFractionalBdStable(wethAmount_d18, bdxAmount_d18, to_d18(1));
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

        const cr = 0.7;
        await lockBdEuCrAt(hre, cr);

        await bdx.transfer(testUser.address, to_d18(100)); // deployer gives some bdeu to user, so user can mint
        await weth.connect(testUser).deposit({ value: to_d18(100) });

        const wethBalanceBeforeMinting_d18 = await weth.balanceOf(testUser.address);
        const bdEuBalanceBeforeMinting_d18 = await bdEu.balanceOf(testUser.address);
        const bdxBalanceBeforeMinting_d18 = await bdx.balanceOf(testUser.address);
        const bdEuBdxBalanceBeforeMinting_d18 = await bdx.balanceOf(bdEu.address);

        const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEuPool.getCollateralPrice_d12();
        const bdxPriceInWeth_d12 = BigNumber.from(1e12).mul(wethInEurPrice_d12).div(bdxInEurPrice_d12);

        // calculate how much is needed to mint
        const wethAmountForMintigBdEu_d18 = to_d18(0.1); // CR% of total value
        const bdxAmountForMintigBdEu_d18 = wethAmountForMintigBdEu_d18.mul(to_d8(1-cr)).div(to_d8(cr)).mul(bdxPriceInWeth_d12).div(1e12); // the remaining 30% of value

        const excessiveBdxAmountForMintigBdEu_d18 = bdxAmountForMintigBdEu_d18.mul(3); // the excess should be ignored
        await performFractionalMinting(testUser, wethAmountForMintigBdEu_d18, excessiveBdxAmountForMintigBdEu_d18);        
        
        // asserts
    
        const bdxBalanceAfterMinting_d18 = await bdx.balanceOf(testUser.address);
        const actualBdxCost_d18 = bdxBalanceBeforeMinting_d18.sub(bdxBalanceAfterMinting_d18);  
        const diffPctBdxCost = diffPct(actualBdxCost_d18, bdxAmountForMintigBdEu_d18);
        console.log(`Diff BDX cost: ${diffPctBdxCost}%`);
        expect(diffPctBdxCost).to.be.closeTo(0, 0.001, "invalid bdx diff");

        const bdEuBdxBalanceAfterMinting_d18 = await bdx.balanceOf(bdEu.address);
        const actualBdxIntoBdEu_d18 = bdEuBdxBalanceAfterMinting_d18.sub(bdEuBdxBalanceBeforeMinting_d18);  
        const diffPctBdxIntoBdEu = diffPct(actualBdxIntoBdEu_d18, bdxAmountForMintigBdEu_d18);
        console.log(`Diff BDX into BdEu: ${diffPctBdxIntoBdEu}%`);
        expect(diffPctBdxIntoBdEu).to.be.closeTo(0, 0.001, "invalid bdx into bdeu diff");

        const wethBalanceAfterMinging_d18 = await weth.balanceOf(testUser.address);
        const actualWethCost_d18 = wethBalanceBeforeMinting_d18.sub(wethBalanceAfterMinging_d18);
        const diffPctWethBalance = diffPct(actualWethCost_d18, wethAmountForMintigBdEu_d18);
        console.log(`Diff Weth balance: ${diffPctWethBalance}%`);
        expect(diffPctWethBalance).to.be.closeTo(0, 0.001, "invalid weth diff");

        const bdEuFromBdx_d18 = bdxAmountForMintigBdEu_d18.mul(bdxInEurPrice_d12).div(1e12);
        const bdEuFromWeth_d18 = wethAmountForMintigBdEu_d18.mul(wethInEurPrice_d12).div(1e12);
        const expectedBdEuDiff_d18 = bdEuFromBdx_d18.add(bdEuFromWeth_d18)
            .mul(to_d12(1 - 0.003)).div(1e12); // decrease by minting fee;
            
        const bdEuBalanceAfterMinting_d18 = await bdEu.balanceOf(testUser.address);
        const diffPctBdEu = diffPct(bdEuBalanceAfterMinting_d18.sub(bdEuBalanceBeforeMinting_d18), expectedBdEuDiff_d18);
        console.log(`Diff BdEu balance: ${diffPctBdEu}%`);
        expect(diffPctBdEu).to.be.closeTo(0, 0.001, "invalid bdEu diff");
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

        await bdEu.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeu to user, so user can redeem
        await weth.connect(testUser).deposit({ value: to_d18(100) });

        const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(testUser.address);
        const bdxBalanceBeforeRedeem_d18 = await bdx.balanceOf(testUser.address);
        const wethBalanceBeforeRedeem_d18 = await weth.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEuPool.getCollateralPrice_d12();

        const bdEuToRedeem_d18 = to_d18(100);

        // calculate how much is needed to mint
        const expectedWethRedemptionPayment_d18 = bdEuToRedeem_d18
            .mul(to_d12(cr)).div(1e12)
            .mul(1e12).div(wethInEurPrice_d12)
            .mul(to_d12(1 - 0.003)).div(1e12); // decrease by redemption fee

        const expectedBdxRedemptionPayment_d18 = bdEuToRedeem_d18
            .mul(to_d12(1-cr)).div(1e12)
            .mul(1e12).div(bdxInEurPrice_d12)
            .mul(to_d12(1 - 0.003)).div(1e12); // decrease by redemption fee;

        await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem_d18);
        await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 1);
        await bdEuPool.connect(testUser).collectRedemption();
        
        // asserts

        const bdEuBalanceAfterRedeem_d18 = await bdEu.balanceOf(testUser.address);
        console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem_d18));
        expect(bdEuBalanceAfterRedeem_d18).to.eq(bdEuBalanceBeforeRedeem_d18.sub(bdEuToRedeem_d18), "unexpected bdEu balance");
        
        const wethBalanceAfterRedeem_d18 = await weth.balanceOf(testUser.address);
        const wethDelta_d18 = wethBalanceAfterRedeem_d18.sub(wethBalanceBeforeRedeem_d18);
        const wethDiffPct = diffPct(expectedWethRedemptionPayment_d18, wethDelta_d18);
        console.log("expected weth redemption payment: " + expectedWethRedemptionPayment_d18);
        console.log("weth balance delta:               " + wethDelta_d18);
        console.log("weth diff pct:                    " + wethDiffPct);
        expect(wethDiffPct).to.be.closeTo(0, 0.0001, "unexpected weth balance");
        
        const bdxBalanceAfterRedeem_d18 = await bdx.balanceOf(testUser.address);
        const bdxDelta_d18 = bdxBalanceAfterRedeem_d18.sub(bdxBalanceBeforeRedeem_d18);
        const bdxDiffPct = diffPct(expectedBdxRedemptionPayment_d18, bdxDelta_d18);
        console.log("expected bdx redemption payment: " + expectedBdxRedemptionPayment_d18);
        console.log("bdx balance delta:               " + bdxDelta_d18);
        console.log("bdx diff pct:                    " + bdxDiffPct);
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

        await bdEu.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeu to user, so user can redeem
        await weth.connect(testUser).deposit({ value: to_d18(100) });

        const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(testUser.address);
        const bdxBalanceBeforeRedeem_d18 = await bdx.balanceOf(testUser.address);
        const wethBalanceBeforeRedeem_d18 = await weth.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEuPool.getCollateralPrice_d12();

        const bdEuToRedeem_d18 = to_d18(100);

        // calculate how much is needed to mint
        const expectedWethRedemptionPayment_d18 = bdEuToRedeem_d18
            .mul(efCR_d12).div(1e12)
            .mul(1e12).div(wethInEurPrice_d12)
            .mul(to_d12(1 - 0.003)).div(1e12); // decrease by redemption fee

        const expectedBdxRedemptionPayment_d18 = bdEuToRedeem_d18
            .mul(to_d12(1).sub(efCR_d12)).div(1e12)
            .mul(1e12).div(bdxInEurPrice_d12)
            .mul(to_d12(1 - 0.003)).div(1e12); // decrease by redemption fee

        await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem_d18);
        await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 1);
        await bdEuPool.connect(testUser).collectRedemption();
        
        // asserts

        const bdEuBalanceAfterRedeem_d18 = await bdEu.balanceOf(testUser.address);
        console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem_d18));
        expect(bdEuBalanceAfterRedeem_d18).to.eq(bdEuBalanceBeforeRedeem_d18.sub(bdEuToRedeem_d18), "unexpected bdEu balance");
        
        const wethBalanceAfterRedeem_d18 = await weth.balanceOf(testUser.address);
        const wethDelta_d18 = wethBalanceAfterRedeem_d18.sub(wethBalanceBeforeRedeem_d18);
        const wethDiffPct = diffPct(expectedWethRedemptionPayment_d18, wethDelta_d18);
        console.log("expected weth redemption payment: " + expectedWethRedemptionPayment_d18);
        console.log("weth balance delta:               " + wethDelta_d18);
        console.log("weth diff pct:                    " + wethDiffPct);
        expect(wethDiffPct).to.be.closeTo(0, 0.0001, "unexpected weth balance");
        
        const bdxBalanceAfterRedeem_d18 = await bdx.balanceOf(testUser.address);
        const bdxDelta_d18 = bdxBalanceAfterRedeem_d18.sub(bdxBalanceBeforeRedeem_d18);
        const bdxDiffPct = diffPct(expectedBdxRedemptionPayment_d18, bdxDelta_d18);
        console.log("expected bdx redemption payment: " + expectedBdxRedemptionPayment_d18);
        console.log("bdx balance delta:               " + bdxDelta_d18);
        console.log("bdx diff pct:                    " + bdxDiffPct);
        expect(bdxDiffPct).to.be.closeTo(0, 0.0001, "unexpected bdx balance");
    });

    it("should tax illegal fractional redemption", async () => {
        await setUpFunctionalSystem(hre, 0.9); // low initial collateralization so efCR is low (for test purposes)

        const testUser = await hre.ethers.getNamedSigner('TEST2');
        const treasury = await getTreasury(hre);

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEu = await getBdEu(hre);
        const bdEuPool = await getBdEuWethPool(hre);

        const cr = 0.2;

        await lockBdEuCrAt(hre, cr);   

        const wethInEurPrice_d12 = await bdEuPool.getCollateralPrice_d12();
        const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();

        // calculate how much is needed to mint
        await bdx.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeu to user, so user can mint
        await weth.connect(testUser).deposit({ value: to_d18(100) });

        // setup bdEu so it's illegal to redeem for testUser
        await performFractionalMinting(testUser, to_d18(0.1), to_d18(100));   
        await bdEu.setMinimumSwapsDelayInBlocks(100);
        // setup finished

        await bdEu.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeu to user, so user can redeem

        const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(testUser.address);
        const bdxBalanceBeforeRedeem_d18 = await bdx.balanceOf(testUser.address);
        const bdxBalanceBeforeRedeemTreasury_d18 = await bdx.balanceOf(treasury.address);
        const wethBalanceBeforeRedeem_d18 = await weth.balanceOf(testUser.address);
        const wethBalanceBeforeRedeemTreasury_d18 = await weth.balanceOf(treasury.address);

        const bdEuToRedeem_d18 = to_d18(100);

        // calculate how much is needed to mint
        const expectedWethRedemptionPayment_d18 = bdEuToRedeem_d18
            .mul(to_d12(cr)).div(1e12)
            .mul(1e12).div(wethInEurPrice_d12)
            .mul(to_d12(1 - 0.003)).div(1e12); // decrease by redemption fee

        const expectedWethRedemptionPaymentUser_d18 = expectedWethRedemptionPayment_d18.div(10)
        const expectedWethRedemptionPaymentTreasury_d18 = expectedWethRedemptionPayment_d18.mul(9).div(10)

        const expectedBdxRedemptionPayment_d18 = bdEuToRedeem_d18
            .mul(to_d12(1-cr)).div(1e12)
            .mul(1e12).div(bdxInEurPrice_d12)
            .mul(to_d12(1 - 0.003)).div(1e12); // decrease by redemption fee
        
        const expectedBdxRedemptionPaymentUser_d18 = expectedBdxRedemptionPayment_d18.div(10);
        const expectedBdxRedemptionPaymentTreasury_d18 = expectedBdxRedemptionPayment_d18.mul(9).div(10);

        await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem_d18);
        await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 1);
        await bdEuPool.connect(testUser).collectRedemption();
        await bdEuPool.connect(treasury).collectRedemption();
        
        // asserts

        const bdEuBalanceAfterRedeem_d18 = await bdEu.balanceOf(testUser.address);
        console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem_d18));
        expect(bdEuBalanceAfterRedeem_d18).to.eq(bdEuBalanceBeforeRedeem_d18.sub(bdEuToRedeem_d18), "unexpected bdEu balance");

        const wethBalanceAfterRedeem_d18 = await weth.balanceOf(testUser.address);
        const wethBalanceAfterRedeemTreasury_d18 = await weth.balanceOf(treasury.address);
        const wethDelta_d18 = wethBalanceAfterRedeem_d18.sub(wethBalanceBeforeRedeem_d18);
        const wethDeltaTreasury_d18 = wethBalanceAfterRedeemTreasury_d18.sub(wethBalanceBeforeRedeemTreasury_d18);

        expect(d18_ToNumber(wethDelta_d18)).to.be.closeTo(d18_ToNumber(expectedWethRedemptionPaymentUser_d18), 1e-6, "invalid weth delta (user)");
        expect(d18_ToNumber(wethDeltaTreasury_d18)).to.be.closeTo(d18_ToNumber(expectedWethRedemptionPaymentTreasury_d18), 1e-6, "invalid weth delta (treasury)");
        
        const bdxBalanceAfterRedeem_d18 = await bdx.balanceOf(testUser.address);
        const bdxBalanceAfterRedeemTreasury_d18 = await bdx.balanceOf(treasury.address);
        const bdxDelta_d18 = bdxBalanceAfterRedeem_d18.sub(bdxBalanceBeforeRedeem_d18);
        const bdxDeltaTreasury_d18 = bdxBalanceAfterRedeemTreasury_d18.sub(bdxBalanceBeforeRedeemTreasury_d18);
        expect(d18_ToNumber(bdxDelta_d18)).to.be.closeTo(d18_ToNumber(expectedBdxRedemptionPaymentUser_d18), 1e-6, "invalid bdx delta (user)")
        expect(d18_ToNumber(bdxDeltaTreasury_d18)).to.be.closeTo(d18_ToNumber(expectedBdxRedemptionPaymentTreasury_d18), 1e-6, "invalid bdx delta (treasury)")
    });

    it("redeem should reward bdx in BDX CR amount", async () => {
        await setUpFunctionalSystem(hre);

        const deployer = await getDeployer(hre);
        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEu = await getBdEu(hre);
        const bdEuPool = await getBdEuWethPool(hre);

        const bdxLeftInBdEu_d18 = to_d18(6);
        const bdxToRemoveFromBdEu_d18 = (await bdx.balanceOf(bdEu.address)).sub(bdxLeftInBdEu_d18);
        await bdEu.transfer_bdx(deployer.address, bdxToRemoveFromBdEu_d18); // deployer takes bdx form bdEu to decrease effective BDX CR

        // enable fractional redeem
        const cr = 0.7;
        await lockBdEuCrAt(hre, cr);

        const bdxEfCr = d12_ToNumber(await bdEu.get_effective_bdx_coverage_ratio());
        expect(bdxEfCr).to.be.lt(1, "bdxEfCr should be < 1"); // test validation

        await bdEu.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeu to user, so user can redeem

        const bdEuBdxBalanceBefore_d18 = await bdx.balanceOf(bdEu.address);
        const userBdxBalanceBefore_d18 = await bdx.balanceOf(testUser.address);

        //act
        const bdEuToRedeem = 100;
        const bdEuToRedeem_d18 = to_d18(bdEuToRedeem);
        await bdEu.connect(testUser).approve(bdEuPool.address, bdEuToRedeem_d18); 
        await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 1);
        await bdEuPool.connect(testUser).collectRedemption();

        const bdEuBdxBalanceAfter_d18 = await bdx.balanceOf(bdEu.address);
        const userBdxBalanceAfter_d18 = await bdx.balanceOf(testUser.address);

        const bdxPrice = d12_ToNumber(await bdEu.BDX_price_d12());

        console.log("bdxEfCr: " + bdxEfCr);
        console.log("bdEuBdxBalanceBefore_d18: " + bdEuBdxBalanceBefore_d18);
        console.log("bdEuBdxBalanceAfter_d18: " + bdEuBdxBalanceAfter_d18);
        console.log("bdxPrice: " + bdxPrice);

        const expectedBdxDiffInBdEu = bdEuToRedeem * (1-cr) * bdxEfCr / bdxPrice;
        console.log("expectedBdxDiffInBdEu: " + expectedBdxDiffInBdEu);

        const actualBdxDiffInBdEu = d18_ToNumber(bdEuBdxBalanceAfter_d18.sub(bdEuBdxBalanceBefore_d18));
        console.log("actualBdxDiffInBdEu: " + actualBdxDiffInBdEu);

        const actualBdxDiffInUser = d18_ToNumber(userBdxBalanceAfter_d18.sub(userBdxBalanceBefore_d18));
        console.log("actualBdxDiffInUser: " + actualBdxDiffInUser);

        expect(actualBdxDiffInBdEu).to.be.closeTo(-expectedBdxDiffInBdEu, 1e-3, "invalid bdx diff in bdEu");
        expect(actualBdxDiffInUser).to.be.closeTo(expectedBdxDiffInBdEu, 1e-3, "invalid bdx diff in user");
    });
});
