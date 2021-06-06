import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct, simulateTimeElapseInDays, simulateTimeElapseInSeconds } from "../../utils/Helpers";
import { toErc20, erc20ToNumber, numberToBigNumberFixed } from "../../utils/Helpers"
import { BdStablePool } from "../../typechain/BdStablePool";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { updateBdxOracleRefreshRatiosBdEur, updateBdxOracle } from "../helpers/bdStable";
import { getBdEur, getBdx, getWeth, getBdEurPool } from "../helpers/common";
import { provideLiquidity_BDX_WETH_userTest1, provideLiquidity_BDEUR_WETH_userTest1 } from "../helpers/swaps";
import { getOnChainEthEurPrice } from "../helpers/common";
import { updateWethPair } from "../helpers/swaps";
import { BigNumber } from "ethers";
import { BDXShares } from "../../typechain/BDXShares";
import { BDStable } from "../../typechain/BdStable";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function performAlgorithmicMinting(testUser: SignerWithAddress, bdxAmount: number){
    const bdx = await getBdx(hre);
    const bdEurPool = await getBdEurPool(hre);

    await updateBdxOracleRefreshRatiosBdEur(hre);
    await updateWethPair(hre, "BDXShares");

    await bdx.connect(testUser).approve(bdEurPool.address, toErc20(bdxAmount)); 
    await bdEurPool.connect(testUser).mintAlgorithmicBdStable((toErc20(bdxAmount)), (toErc20(1)));
}

describe("BDStable algorythmic", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    async function mintInitalBdx_MoveCrTo0(bdEur: BDStable, bdx: BDXShares, user: SignerWithAddress, startingBdxBalance: BigNumber) {
        // set step to 1 to get CR = 0 after first refresh
        await bdEur.setBdstable_step_d12(numberToBigNumberFixed(1, 12));

        await bdx.mint(user.address, startingBdxBalance);

        const ethInBdxPrice = 100;

        // liquidity provided by another user!
        await provideLiquidity_BDEUR_WETH_userTest1(hre, 1000);
        await provideLiquidity_BDX_WETH_userTest1(hre, ethInBdxPrice);

        await updateBdxOracleRefreshRatiosBdEur(hre);
        await updateBdxOracle(hre);
    }

    it("should mint bdeur when CR = 0", async () => {
        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);
        const bdEurPool = await getBdEurPool(hre);

        const bdxBalanceBeforeMintingWithCR0 = toErc20(1000000);

        await mintInitalBdx_MoveCrTo0(bdEur, bdx, testUser, bdxBalanceBeforeMintingWithCR0);

        const wethBalanceBeforeMinting = await weth.balanceOf(testUser.address);
        const bdEurlBalanceBeforeMinting = await bdEur.balanceOf(testUser.address);

        const bdxInEurPrice = await bdEur.BDX_price_d12();

        const bdxAmountForMintigBdEur = 10;

        await performAlgorithmicMinting(testUser, bdxAmountForMintigBdEur);

        const expectedBdxCost = toErc20(bdxAmountForMintigBdEur);
        const expectedBdEurDiff = toErc20(bdxAmountForMintigBdEur).mul(bdxInEurPrice).div(1e12);

        const bdEurBalanceAfterMinting = await bdEur.balanceOf(testUser.address);

        const diffPctBdEur = diffPct(bdEurBalanceAfterMinting.sub(bdEurlBalanceBeforeMinting), expectedBdEurDiff);

        const bdxBalanceAfterMinting = await bdx.balanceOf(testUser.address);
        const actualBdxCost = bdxBalanceBeforeMintingWithCR0.sub(bdxBalanceAfterMinting);  
        
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
        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);
        const bdEurPool = await getBdEurPool(hre);

        await weth.connect(testUser).approve(bdEurPool.address, 10);
        await bdEurPool.connect(testUser).mint1t1BD(10, 1);

        const bdxBalanceBeforeMintingWithCR0 = toErc20(1000000);

        await mintInitalBdx_MoveCrTo0(bdEur, bdx, testUser, bdxBalanceBeforeMintingWithCR0);

        const bdxAmount = 10;
        await performAlgorithmicMinting(testUser, bdxAmount);

        const bdEurBalanceBeforeRedeem = await bdEur.balanceOf(testUser.address);
        const bdxBalanceBeforeRedeem = await bdx.balanceOf(testUser.address);
        const wethBalanceBeforeRedeem = await weth.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        console.log("bdxInEurPrice           : " + bdxInEurPrice_d12);
        console.log("bdEurBalanceBeforeRedeem: " + bdEurBalanceBeforeRedeem);

        // mul 1e12 do compensate for bdxInEurPrice_d12
        const expectedBdxDelta = erc20ToNumber(bdEurBalanceBeforeRedeem.mul(1e12).div(bdxInEurPrice_d12));

        await bdEur.connect(testUser).approve(bdEurPool.address, bdEurBalanceBeforeRedeem);

        await bdEurPool.connect(testUser).redeemAlgorithmicBdStable(bdEurBalanceBeforeRedeem, toErc20(1));
        await bdEurPool.connect(testUser).collectRedemption();

        const bdEurBalanceAfterRedeem = await bdEur.balanceOf(testUser.address);
        const bdxBalanceAfterRedeem = await bdx.balanceOf(testUser.address);
        const wethBalanceAfterRedeem = await weth.balanceOf(testUser.address);

        console.log("bdEur balance before redeem: " + erc20ToNumber(bdEurBalanceBeforeRedeem));
        console.log("bdEur balance after redeem:  " + erc20ToNumber(bdEurBalanceAfterRedeem));
        
        console.log("weth balance before redeem:  " + erc20ToNumber(wethBalanceBeforeRedeem));
        console.log("weth balance after redeem:   " + erc20ToNumber(wethBalanceAfterRedeem));

        const wethDelta = erc20ToNumber(wethBalanceAfterRedeem.sub(wethBalanceBeforeRedeem));
        console.log("weth balance delta: " + wethDelta);
        
        const bdxDelta = erc20ToNumber(bdxBalanceAfterRedeem.sub(bdxBalanceBeforeRedeem));
        console.log("bdx balance delta:          " + bdxDelta);
        console.log("expected bdx balance delta: " + expectedBdxDelta);

        expect(bdEurBalanceBeforeRedeem).to.be.gt(0);
        expect(bdEurBalanceAfterRedeem).to.eq(0);
        expect(wethDelta).to.eq(0);
        expect(bdxDelta).to.be.closeTo(expectedBdxDelta, 0.1);
    });
})
