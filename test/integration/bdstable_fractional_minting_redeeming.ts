import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct } from "../../utils/Helpers";
import { to_d18, d18_ToNumber } from "../../utils/Helpers"
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { lockBdEurCrAt } from "../helpers/bdStable";
import { getBdEur, getBdx, getWeth, getBdEurWethPool } from "../helpers/common";
import { BigNumber } from "ethers";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function performFractionalMinting(testUser: SignerWithAddress, collateralAmount_d18: BigNumber, bdxAmount_d18: BigNumber){
    const bdx = await getBdx(hre);
    const bdEurPool = await getBdEurWethPool(hre);
    const weth = await getWeth(hre);

    await weth.connect(testUser).approve(bdEurPool.address, collateralAmount_d18);
    await bdx.connect(testUser).approve(bdEurPool.address, bdxAmount_d18); 

    await bdEurPool.connect(testUser).mintFractionalBdStable(collateralAmount_d18, bdxAmount_d18, (to_d18(1)));
}

describe("BDStable fractional", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystem(hre);
    });

    it("should mint bdeur when CR > 0 & CR < 1", async () => {
        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);
        const bdEurPool = await getBdEurWethPool(hre);

        await lockBdEurCrAt(hre, 0.7);

        await bdx.transfer(testUser.address, to_d18(100)); // deployer gives some bdeur to user, so user can mint
        await bdEur.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeur to user, so user can mint

        const wethBalanceBeforeMinting_d18 = await weth.balanceOf(testUser.address);
        const bdEurlBalanceBeforeMinting_d18 = await bdEur.balanceOf(testUser.address);
        const bdxlBalanceBeforeMinting_d18 = await bdx.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEurPool.getCollateralPrice();
        const bdxPriceInWeth_d12 = BigNumber.from(1e12).mul(wethInEurPrice_d12).div(bdxInEurPrice_d12);

        // calculate how much is needed to mint
        const wethAmountForMintigBdEur_d18 = to_d18(0.1); // 70% of total value
        const bdxAmountForMintigBdEur_d18 = wethAmountForMintigBdEur_d18.mul(30).div(70).mul(bdxPriceInWeth_d12).div(1e12); // the remaining 30% of value

        const excessiveBdxAmountForMintigBdEur_d18 = bdxAmountForMintigBdEur_d18.mul(3); // the excess should be ignored
        await performFractionalMinting(testUser, wethAmountForMintigBdEur_d18, excessiveBdxAmountForMintigBdEur_d18);        
        
        // asserts
    
        const bdxBalanceAfterMinting_d18 = await bdx.balanceOf(testUser.address);
        const actualBdxCost_d18 = bdxlBalanceBeforeMinting_d18.sub(bdxBalanceAfterMinting_d18);  
        const diffPctBdxCost = diffPct(actualBdxCost_d18, bdxAmountForMintigBdEur_d18);
        console.log(`Diff BDX cost: ${diffPctBdxCost}%`);
        expect(diffPctBdxCost).to.be.closeTo(0, 0.1);

        const wethBalanceAfterMinging_d18 = await weth.balanceOf(testUser.address);
        const actualWethCost_d18 = wethBalanceBeforeMinting_d18.sub(wethBalanceAfterMinging_d18);
        const diffPctWethBalance = diffPct(actualWethCost_d18, wethAmountForMintigBdEur_d18);
        console.log(`Diff Weth balance: ${diffPctWethBalance}%`);
        expect(diffPctWethBalance).to.be.closeTo(0, 0.1);

        const bdEurFromBdx_d18 = bdxAmountForMintigBdEur_d18.mul(bdxInEurPrice_d12).div(1e12);
        const bdEurFromWeth_d18 = wethAmountForMintigBdEur_d18.mul(wethInEurPrice_d12).div(1e12);
        const expectedBdEurDiff_d18 = bdEurFromBdx_d18.add(bdEurFromWeth_d18);
        const bdEurBalanceAfterMinting_d18 = await bdEur.balanceOf(testUser.address);
        const diffPctBdEur = diffPct(bdEurBalanceAfterMinting_d18.sub(bdEurlBalanceBeforeMinting_d18), expectedBdEurDiff_d18);
        console.log(`Diff BdEur balance: ${diffPctBdEur}%`);
        expect(diffPctBdEur).to.be.closeTo(0, 0.1);
    });

    it("should redeem bdeur when CR > 0 & CR < 1", async () => {
        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);
        const bdEurPool = await getBdEurWethPool(hre);

        await lockBdEurCrAt(hre, 0.7);

        await bdx.transfer(testUser.address, to_d18(100)); // deployer gives some bdeur to user, so user can redeem
        await bdEur.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeur to user, so user can redeem

        const bdEurBalanceBeforeRedeem_d18 = await bdEur.balanceOf(testUser.address);
        const bdxBalanceBeforeRedeem_d18 = await bdx.balanceOf(testUser.address);
        const wethBalanceBeforeRedeem_d18 = await weth.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEurPool.getCollateralPrice();

        const bdEurToRedeem_d18 = to_d18(100);

        // calculate how much is needed to mint
        const expectedWethRedeemingCost_d18 = bdEurToRedeem_d18.mul(70).div(100).mul(1e12).div(wethInEurPrice_d12);
        const expectedBdxRedeemingCost_d18 = bdEurToRedeem_d18.mul(30).div(100).mul(1e12).div(bdxInEurPrice_d12);

        await bdEur.connect(testUser).approve(bdEurPool.address, bdEurBalanceBeforeRedeem_d18);
        await bdEurPool.connect(testUser).redeemFractionalBdStable(bdEurToRedeem_d18, 1, 1);
        await bdEurPool.connect(testUser).collectRedemption();
        
        // asserts

        const bdEurBalanceAfterRedeem_d18 = await bdEur.balanceOf(testUser.address);
        console.log("bdEur balance after redeem:  " + d18_ToNumber(bdEurBalanceAfterRedeem_d18));
        expect(bdEurBalanceAfterRedeem_d18).to.eq(bdEurBalanceBeforeRedeem_d18.sub(bdEurToRedeem_d18));
        
        const wethBalanceAfterRedeem_d18 = await weth.balanceOf(testUser.address);
        const wethDelta_d18 = wethBalanceAfterRedeem_d18.sub(wethBalanceBeforeRedeem_d18);
        const wethDiffPct = diffPct(expectedWethRedeemingCost_d18, wethDelta_d18);
        console.log("expected weth redeeming cost: " + expectedWethRedeemingCost_d18);
        console.log("weth balance delta:           " + wethDelta_d18);
        console.log("weth diff pct:                " + wethDiffPct);
        expect(wethDiffPct).to.be.closeTo(0, 0.1);
        
        const bdxBalanceAfterRedeem_d18 = await bdx.balanceOf(testUser.address);
        const bdxDelta_d18 = bdxBalanceAfterRedeem_d18.sub(bdxBalanceBeforeRedeem_d18);
        const bdxDiffPct = diffPct(expectedBdxRedeemingCost_d18, bdxDelta_d18);
        console.log("expected bdx balance delta: " + expectedBdxRedeemingCost_d18);
        console.log("bdx balance delta:          " + bdxDelta_d18);
        console.log("bdx diff pct:               " + bdxDiffPct);
        expect(bdxDiffPct).to.be.closeTo(0, 0.1);
    });
})
