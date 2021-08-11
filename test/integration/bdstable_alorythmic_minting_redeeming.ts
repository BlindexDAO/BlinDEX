import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct } from "../../utils/Helpers";
import { to_d18, d18_ToNumber } from "../../utils/Helpers"
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { getBdEu, getBdx, getWeth, getBdEuWethPool, getUser } from "../helpers/common";
import { lockBdEuCrAt } from "../helpers/bdStable";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function performAlgorithmicMinting(testUser: SignerWithAddress, bdxAmount: number){
    const bdx = await getBdx(hre);
    const bdEuPool = await getBdEuWethPool(hre);

    await bdx.connect(testUser).approve(bdEuPool.address, to_d18(bdxAmount)); 
    await bdEuPool.connect(testUser).mintAlgorithmicBdStable((to_d18(bdxAmount)), (to_d18(1)));
}

describe("BDStable algorythmic", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystem(hre);
    });

    it("should mint bdeu when CR = 0", async () => {
        const testUser = await getUser(hre);

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEu = await getBdEu(hre);

        await bdx.transfer(testUser.address, to_d18(1000)); // deployer gives some bdx to user, so user can mint
        const bdxBalanceBeforeMinting = await bdx.balanceOf(testUser.address);

        await lockBdEuCrAt(hre, 0);

        const wethBalanceBeforeMinting = await weth.balanceOf(testUser.address);
        const bdEulBalanceBeforeMinting = await bdEu.balanceOf(testUser.address);

        const bdxInEurPrice = await bdEu.BDX_price_d12();

        const bdxAmountForMintigBdEu = 10;

        await performAlgorithmicMinting(testUser, bdxAmountForMintigBdEu);

        const expectedBdxCost = to_d18(bdxAmountForMintigBdEu);
        const expectedBdEuDiff = to_d18(bdxAmountForMintigBdEu).mul(bdxInEurPrice).div(1e12);

        const bdEuBalanceAfterMinting = await bdEu.balanceOf(testUser.address);

        const diffPctBdEu = diffPct(bdEuBalanceAfterMinting.sub(bdEulBalanceBeforeMinting), expectedBdEuDiff);

        const bdxBalanceAfterMinting = await bdx.balanceOf(testUser.address);
        const actualBdxCost = bdxBalanceBeforeMinting.sub(bdxBalanceAfterMinting);  
        
        const diffPctBdxCost = diffPct(actualBdxCost, expectedBdxCost);
        const actualWeth = await weth.balanceOf(testUser.address);

        const diffPctWethBalance = diffPct(wethBalanceBeforeMinting, actualWeth);

        console.log(`Diff BDX cost: ${diffPctBdxCost}%`);
        console.log(`Diff BdEu balance: ${diffPctBdEu}%`);
        console.log(`Diff Weth balance: ${diffPctWethBalance}%`);

        expect(diffPctBdxCost).to.be.closeTo(0, 0.01);
        expect(diffPctWethBalance).to.be.closeTo(0, 0.01);
        expect(diffPctBdEu).to.be.closeTo(0, 0.01);
    });

    it("should redeem bdeu when CR = 0", async () => {
        const testUser = await getUser(hre);

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEu = await getBdEu(hre);
        const bdEuPool = await getBdEuWethPool(hre);

        await lockBdEuCrAt(hre, 0);

        await bdEu.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeu to user, so user can redeem

        const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(testUser.address);
        const bdxBalanceBeforeRedeem_d18 = await bdx.balanceOf(testUser.address);
        const wethBalanceBeforeRedeem_d18 = await weth.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
        console.log("bdxInEurPrice           : " + bdxInEurPrice_d12);
        console.log("bdEuBalanceBeforeRedeem: " + bdEuBalanceBeforeRedeem_d18);

        const bdEuToRedeem_d18 = to_d18(100);

        const expectedBdxDelta = d18_ToNumber(bdEuToRedeem_d18.mul(1e12).div(bdxInEurPrice_d12));
        const expectedBdEuDelta = d18_ToNumber(bdEuToRedeem_d18);

        await bdEu.connect(testUser).approve(bdEuPool.address, bdEuToRedeem_d18);

        await bdEuPool.connect(testUser).redeemAlgorithmicBdStable(bdEuToRedeem_d18, 1);
        await bdEuPool.connect(testUser).collectRedemption();

        const bdEuBalanceAfterRedeem_d18 = await bdEu.balanceOf(testUser.address);
        const bdxBalanceAfterRedeem_d18 = await bdx.balanceOf(testUser.address);
        const wethBalanceAfterRedeem_d18 = await weth.balanceOf(testUser.address);

        console.log("bdEu balance before redeem: " + d18_ToNumber(bdEuBalanceBeforeRedeem_d18));
        console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem_d18));
        
        console.log("weth balance before redeem:  " + d18_ToNumber(wethBalanceBeforeRedeem_d18));
        console.log("weth balance after redeem:   " + d18_ToNumber(wethBalanceAfterRedeem_d18));

        const wethDelta = d18_ToNumber(wethBalanceAfterRedeem_d18.sub(wethBalanceBeforeRedeem_d18));
        console.log("weth balance delta: " + wethDelta);
        
        const bdxDelta = d18_ToNumber(bdxBalanceAfterRedeem_d18.sub(bdxBalanceBeforeRedeem_d18));
        console.log("bdx balance delta:          " + bdxDelta);
        console.log("expected bdx balance delta: " + expectedBdxDelta);

        const bdEuDelta = d18_ToNumber(bdEuBalanceBeforeRedeem_d18.sub(bdEuBalanceAfterRedeem_d18));
        console.log("bdEu balance delta:          " + bdEuDelta);
        console.log("expected bdEu balance delta: " + expectedBdEuDelta);

        expect(wethDelta).to.eq(0);
        expect(bdxDelta).to.be.closeTo(expectedBdxDelta, 0.1);
        expect(bdEuDelta).to.be.closeTo(expectedBdEuDelta, 0.1);
    });
})
