import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct } from "../../utils/Helpers";
import { to_d18, d18_ToNumber } from "../../utils/Helpers"
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { getBdEur, getBdx, getWeth, getBdEurWethPool, getUser } from "../helpers/common";
import { lockBdEurCrAt } from "../helpers/bdStable";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function performAlgorithmicMinting(testUser: SignerWithAddress, bdxAmount: number){
    const bdx = await getBdx(hre);
    const bdEurPool = await getBdEurWethPool(hre);

    await bdx.connect(testUser).approve(bdEurPool.address, to_d18(bdxAmount)); 
    await bdEurPool.connect(testUser).mintAlgorithmicBdStable((to_d18(bdxAmount)), (to_d18(1)));
}

describe("BDStable algorythmic", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystem(hre);
    });

    it("should mint bdeur when CR = 0", async () => {
        const testUser = await getUser(hre);

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);

        await bdx.transfer(testUser.address, to_d18(1000)); // deployer gives some bdx to user, so user can mint
        const bdxBalanceBeforeMinting = await bdx.balanceOf(testUser.address);

        await lockBdEurCrAt(hre, 0);

        const wethBalanceBeforeMinting = await weth.balanceOf(testUser.address);
        const bdEurlBalanceBeforeMinting = await bdEur.balanceOf(testUser.address);

        const bdxInEurPrice = await bdEur.BDX_price_d12();

        const bdxAmountForMintigBdEur = 10;

        await performAlgorithmicMinting(testUser, bdxAmountForMintigBdEur);

        const expectedBdxCost = to_d18(bdxAmountForMintigBdEur);
        const expectedBdEurDiff = to_d18(bdxAmountForMintigBdEur).mul(bdxInEurPrice).div(1e12);

        const bdEurBalanceAfterMinting = await bdEur.balanceOf(testUser.address);

        const diffPctBdEur = diffPct(bdEurBalanceAfterMinting.sub(bdEurlBalanceBeforeMinting), expectedBdEurDiff);

        const bdxBalanceAfterMinting = await bdx.balanceOf(testUser.address);
        const actualBdxCost = bdxBalanceBeforeMinting.sub(bdxBalanceAfterMinting);  
        
        const diffPctBdxCost = diffPct(actualBdxCost, expectedBdxCost);
        const actualWeth = await weth.balanceOf(testUser.address);

        const diffPctWethBalance = diffPct(wethBalanceBeforeMinting, actualWeth);

        console.log(`Diff BDX cost: ${diffPctBdxCost}%`);
        console.log(`Diff BdEur balance: ${diffPctBdEur}%`);
        console.log(`Diff Weth balance: ${diffPctWethBalance}%`);

        expect(diffPctBdxCost).to.be.closeTo(0, 0.01);
        expect(diffPctWethBalance).to.be.closeTo(0, 0.01);
        expect(diffPctBdEur).to.be.closeTo(0, 0.01);
    });

    it("should redeem bdeur when CR = 0", async () => {
        const testUser = await getUser(hre);

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);
        const bdEurPool = await getBdEurWethPool(hre);

        await lockBdEurCrAt(hre, 0);

        await bdEur.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeur to user, so user can redeem

        const bdEurBalanceBeforeRedeem_d18 = await bdEur.balanceOf(testUser.address);
        const bdxBalanceBeforeRedeem_d18 = await bdx.balanceOf(testUser.address);
        const wethBalanceBeforeRedeem_d18 = await weth.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        console.log("bdxInEurPrice           : " + bdxInEurPrice_d12);
        console.log("bdEurBalanceBeforeRedeem: " + bdEurBalanceBeforeRedeem_d18);

        const bdEurToRedeem_d18 = to_d18(100);

        const expectedBdxDelta = d18_ToNumber(bdEurToRedeem_d18.mul(1e12).div(bdxInEurPrice_d12));
        const expectedBdEurDelta = d18_ToNumber(bdEurToRedeem_d18);

        await bdEur.connect(testUser).approve(bdEurPool.address, bdEurToRedeem_d18);

        await bdEurPool.connect(testUser).redeemAlgorithmicBdStable(bdEurToRedeem_d18, 1);
        await bdEurPool.connect(testUser).collectRedemption();

        const bdEurBalanceAfterRedeem_d18 = await bdEur.balanceOf(testUser.address);
        const bdxBalanceAfterRedeem_d18 = await bdx.balanceOf(testUser.address);
        const wethBalanceAfterRedeem_d18 = await weth.balanceOf(testUser.address);

        console.log("bdEur balance before redeem: " + d18_ToNumber(bdEurBalanceBeforeRedeem_d18));
        console.log("bdEur balance after redeem:  " + d18_ToNumber(bdEurBalanceAfterRedeem_d18));
        
        console.log("weth balance before redeem:  " + d18_ToNumber(wethBalanceBeforeRedeem_d18));
        console.log("weth balance after redeem:   " + d18_ToNumber(wethBalanceAfterRedeem_d18));

        const wethDelta = d18_ToNumber(wethBalanceAfterRedeem_d18.sub(wethBalanceBeforeRedeem_d18));
        console.log("weth balance delta: " + wethDelta);
        
        const bdxDelta = d18_ToNumber(bdxBalanceAfterRedeem_d18.sub(bdxBalanceBeforeRedeem_d18));
        console.log("bdx balance delta:          " + bdxDelta);
        console.log("expected bdx balance delta: " + expectedBdxDelta);

        const bdEurDelta = d18_ToNumber(bdEurBalanceBeforeRedeem_d18.sub(bdEurBalanceAfterRedeem_d18));
        console.log("bdEur balance delta:          " + bdEurDelta);
        console.log("expected bdEu balance delta: " + expectedBdEurDelta);

        expect(wethDelta).to.eq(0);
        expect(bdxDelta).to.be.closeTo(expectedBdxDelta, 0.1);
        expect(bdEurDelta).to.be.closeTo(expectedBdEurDelta, 0.1);
    });
})
