import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct, simulateTimeElapseInDays, simulateTimeElapseInSeconds } from "../../utils/Helpers";
import { toErc20, erc20ToNumber, numberToBigNumberFixed, bigNumberToDecimal } from "../../utils/Helpers"
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

async function performFractionalMinting(testUser: SignerWithAddress, collateralAmount_d18: BigNumber, bdxAmount_d18: BigNumber){
    const bdx = await getBdx(hre);
    const bdEurPool = await getBdEurPool(hre);
    const weth = await getWeth(hre);

    await updateBdxOracleRefreshRatiosBdEur(hre);
    await updateWethPair(hre, "BDXShares");

    await weth.connect(testUser).approve(bdEurPool.address, collateralAmount_d18);
    await bdx.connect(testUser).approve(bdEurPool.address, bdxAmount_d18); 

    await bdEurPool.connect(testUser).mintFractionalBdStable(collateralAmount_d18, bdxAmount_d18, (toErc20(1)));
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

        await weth.connect(user).deposit({ value: toErc20(10000) });
        await bdx.mint(user.address, toErc20(1000000));

        const ethInBdxPrice = 100;

        // liquidity provided by another user!
        await provideLiquidity_BDEUR_WETH_userTest1(hre, 1000);
        await provideLiquidity_BDX_WETH_userTest1(hre, ethInBdxPrice);

        await updateBdxOracleRefreshRatiosBdEur(hre);
        await updateBdxOracle(hre);
        
        await bdEur.setBdstable_step_d12(0); // lock CR at 0.7
    }

    it.only("should mint bdeur when CR > 0 & CR < 1", async () => {
        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);
        const bdEurPool = await getBdEurPool(hre);

        await mintInitalBdx_MoveCrTo0_7(testUser);

        const wethBalanceBeforeMinting = await weth.balanceOf(testUser.address);
        const bdEurlBalanceBeforeMinting = await bdEur.balanceOf(testUser.address);
        const bdxlBalanceBeforeMinting = await bdx.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEurPool.getCollateralPrice();
        const bdxPriceInWeth_d12 = BigNumber.from(1e12).mul(wethInEurPrice_d12).div(bdxInEurPrice_d12);

        // calculate how much is needed to mint
        const wethAmountForMintigBdEur_d18 = toErc20(10); // 70% of total value
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

    it.only("should redeem bdeur when CR > 0 & CR < 1", async () => {
        expect(1).to.be.eq(2);

        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);
        const bdEurPool = await getBdEurPool(hre);

        await weth.connect(testUser).approve(bdEurPool.address, 10);
        await bdEurPool.connect(testUser).mint1t1BD(10, 1);

        const bdxBalanceBeforeMintingWithCR0 = toErc20(1000000);

        await mintInitalBdx_MoveCrTo0_7(testUser);

        const bdxAmount_d18 = toErc20(10);
        const ethAmount_d18 = toErc20(10);
        await performFractionalMinting(testUser, ethAmount_d18, bdxAmount_d18);

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
