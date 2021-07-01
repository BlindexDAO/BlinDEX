import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct } from "../../utils/Helpers";
import { to_d18, d18_ToNumber, numberToBigNumberFixed, bigNumberToDecimal } from "../../utils/Helpers"
import { BdStablePool } from "../../typechain/BdStablePool";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { updateBdxOracleRefreshRatiosBdEur, updateBdxOracle } from "../helpers/bdStable";
import { getBdEur, getBdx, getWeth, getBdEurWethPool } from "../helpers/common";
import { provideLiquidity_BDX_WETH_userTest1, provideLiquidity_BDEUR_WETH_userTest1 } from "../helpers/swaps";
import { getOnChainEthEurPrice } from "../helpers/common";
import { updateWethPair } from "../helpers/swaps";
import { BigNumber } from "ethers";
import { BDXShares } from "../../typechain/BDXShares";
import { BDStable } from "../../typechain/BdStable";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function performFractionalMinting(testUser: SignerWithAddress, collateralAmount_d18: BigNumber, bdxAmount_d18: BigNumber){
    const bdx = await getBdx(hre);
    const bdEurPool = await getBdEurWethPool(hre);
    const weth = await getWeth(hre);

    await updateBdxOracleRefreshRatiosBdEur(hre);
    await updateWethPair(hre, "BDXShares");

    await weth.connect(testUser).approve(bdEurPool.address, collateralAmount_d18);
    await bdx.connect(testUser).approve(bdEurPool.address, bdxAmount_d18); 

    await bdEurPool.connect(testUser).mintFractionalBdStable(collateralAmount_d18, bdxAmount_d18, (to_d18(1)));
}

describe("BDStable fractional", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    async function mintInitalBdx_MoveCrTo0_7(user: SignerWithAddress) {
        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);

        // set step to 1 to get CR = 0 after first refresh
        await bdEur.setBdstable_step_d12(numberToBigNumberFixed(1, 12).mul(3).div(10));

        await weth.connect(user).deposit({ value: to_d18(10000) });
        await bdx.mint(user.address, to_d18(1000000));

        const ethInBdxPrice = 100;

        // liquidity provided by another user!
        await provideLiquidity_BDEUR_WETH_userTest1(hre, 1000);
        await provideLiquidity_BDX_WETH_userTest1(hre, ethInBdxPrice);

        await updateBdxOracleRefreshRatiosBdEur(hre);
        await updateBdxOracle(hre);
        
        await bdEur.setBdstable_step_d12(0); // lock CR at 0.7
    }

    it("should mint bdeur when CR > 0 & CR < 1", async () => {
        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);
        const bdEurPool = await getBdEurWethPool(hre);

        await mintInitalBdx_MoveCrTo0_7(testUser);

        const wethBalanceBeforeMinting = await weth.balanceOf(testUser.address);
        const bdEurlBalanceBeforeMinting = await bdEur.balanceOf(testUser.address);
        const bdxlBalanceBeforeMinting = await bdx.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEurPool.getCollateralPrice();
        const bdxPriceInWeth_d12 = BigNumber.from(1e12).mul(wethInEurPrice_d12).div(bdxInEurPrice_d12);

        // calculate how much is needed to mint
        const wethAmountForMintigBdEur_d18 = to_d18(10); // 70% of total value
        const bdxAmountForMintigBdEur_d18 = wethAmountForMintigBdEur_d18.mul(30).div(70).mul(bdxPriceInWeth_d12).div(1e12);

        const excessiveBdxAmountForMintigBdEur_d18 = bdxAmountForMintigBdEur_d18.mul(3); // the excess should be ignored
        await performFractionalMinting(testUser, wethAmountForMintigBdEur_d18, excessiveBdxAmountForMintigBdEur_d18);        
        
        // asserts
    
        const bdxBalanceAfterMinting = await bdx.balanceOf(testUser.address);
        const actualBdxCost = bdxlBalanceBeforeMinting.sub(bdxBalanceAfterMinting);  
        const diffPctBdxCost = diffPct(actualBdxCost, bdxAmountForMintigBdEur_d18);
        console.log(`Diff BDX cost: ${diffPctBdxCost}%`);
        expect(diffPctBdxCost).to.be.closeTo(0, 0.1);

        const wethBalanceAfterMinging = await weth.balanceOf(testUser.address);
        const actualWethCost = wethBalanceBeforeMinting.sub(wethBalanceAfterMinging);
        const diffPctWethBalance = diffPct(actualWethCost, wethAmountForMintigBdEur_d18);
        console.log(`Diff Weth balance: ${diffPctWethBalance}%`);
        expect(diffPctWethBalance).to.be.closeTo(0, 0.1);

        const bdEurFromBdx = bdxAmountForMintigBdEur_d18.mul(bdxInEurPrice_d12).div(1e12);
        const bdEurFromWeth = wethAmountForMintigBdEur_d18.mul(wethInEurPrice_d12).div(1e12);
        const expectedBdEurDiff = bdEurFromBdx.add(bdEurFromWeth);
        const bdEurBalanceAfterMinting = await bdEur.balanceOf(testUser.address);
        const diffPctBdEur = diffPct(bdEurBalanceAfterMinting.sub(bdEurlBalanceBeforeMinting), expectedBdEurDiff);
        console.log(`Diff BdEur balance: ${diffPctBdEur}%`);
        expect(diffPctBdEur).to.be.closeTo(0, 0.1);
    });

    it("should redeem bdeur when CR > 0 & CR < 1", async () => {
        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);
        const bdEurPool = await getBdEurWethPool(hre);

        await weth.connect(testUser).deposit({ value: to_d18(10) });
        await weth.connect(testUser).approve(bdEurPool.address, to_d18(10));
        await bdEurPool.connect(testUser).mint1t1BD(to_d18(10), 1);

        await mintInitalBdx_MoveCrTo0_7(testUser);

        const bdEurBalanceBeforeRedeem = await bdEur.balanceOf(testUser.address);
        const bdxBalanceBeforeRedeem = await bdx.balanceOf(testUser.address);
        const wethBalanceBeforeRedeem = await weth.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEurPool.getCollateralPrice();

        const bdEurToRedeem = to_d18(10000);

        // calculate how much is needed to mint
        const expectedWethRedeemingCost_d18 = bdEurToRedeem.mul(70).div(100).mul(1e12).div(wethInEurPrice_d12);
        const expectedBdxRedeemingCost_d18 = bdEurToRedeem.mul(30).div(100).mul(1e12).div(bdxInEurPrice_d12);

        await bdEur.connect(testUser).approve(bdEurPool.address, bdEurBalanceBeforeRedeem);
        await bdEurPool.connect(testUser).redeemFractionalBdStable(bdEurToRedeem, 1, 1);
        await bdEurPool.connect(testUser).collectRedemption();
        
        // asserts

        const bdEurBalanceAfterRedeem = await bdEur.balanceOf(testUser.address);
        console.log("bdEur balance after redeem:  " + d18_ToNumber(bdEurBalanceAfterRedeem));
        expect(bdEurBalanceAfterRedeem).to.eq(bdEurBalanceBeforeRedeem.sub(bdEurToRedeem));
        
        const wethBalanceAfterRedeem = await weth.balanceOf(testUser.address);
        const wethDelta = wethBalanceAfterRedeem.sub(wethBalanceBeforeRedeem);
        const wethDiffPct = diffPct(expectedWethRedeemingCost_d18, wethDelta);
        console.log("expected weth redeeming cost: " + expectedWethRedeemingCost_d18);
        console.log("weth balance delta:           " + wethDelta);
        console.log("weth diff pct:                " + wethDiffPct);
        expect(wethDiffPct).to.be.closeTo(0, 0.1);
        
        const bdxBalanceAfterRedeem = await bdx.balanceOf(testUser.address);
        const bdxDelta = bdxBalanceAfterRedeem.sub(bdxBalanceBeforeRedeem);
        const bdxDiffPct = diffPct(expectedBdxRedeemingCost_d18, bdxDelta);
        console.log("expected bdx balance delta: " + expectedBdxRedeemingCost_d18);
        console.log("bdx balance delta:          " + bdxDelta);
        console.log("bdx diff pct:               " + bdxDiffPct);
        expect(bdxDiffPct).to.be.closeTo(0, 0.1);
    });
})
