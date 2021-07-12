import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { d12_ToNumber, diffPct, to_d8 } from "../../utils/Helpers";
import { to_d18, d18_ToNumber } from "../../utils/Helpers"
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { lockBdEurCrAt } from "../helpers/bdStable";
import { getBdEur, getBdEurWbtcPool, getBdEurWethPool, getDeployer, getOnChainBtcEurPrice, getOnChainEthEurPrice, getUser, getWbtc, getWeth, mintWbtc as mintWbtcFromEth } from "../helpers/common";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";
import { HardhatRuntimeEnvironment } from "hardhat/types/runtime";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BDStable 1to1", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystem(hre);
    });

    it("should mint bdeur when CR = 1 [for WETH]", async () => {
        const bdEur = await getBdEur(hre);

        const { ethInEurPrice_1e12, ethInEurPrice } = await getOnChainEthEurPrice(hre);

        const testUser = await getUser(hre);
        const collateralAmount = 10;

        await lockBdEurCrAt(hre, 1);

        const bdEurBefore_d18 = await bdEur.balanceOf(testUser.address);

        await perform1To1MintingForWeth(hre, testUser, collateralAmount);

        const bdEurAfter_d18 = await bdEur.balanceOf(testUser.address);

        console.log("ethInEurPrice: " + d12_ToNumber(ethInEurPrice_1e12));

        const expectedBdEurDiff_d18 = ethInEurPrice_1e12.mul(to_d18(collateralAmount)).div(1e12);
        const actualBdEurDiff_d18 = bdEurAfter_d18.sub(bdEurBefore_d18);
        const diff = diffPct(actualBdEurDiff_d18, expectedBdEurDiff_d18);

        console.log("BeEur before: " + d18_ToNumber(bdEurBefore_d18));
        console.log("BeEur after : " + d18_ToNumber(bdEurAfter_d18));
        console.log("Expected BeEur: " + d18_ToNumber(expectedBdEurDiff_d18));
        console.log("Actual   BeEur: " + d18_ToNumber(actualBdEurDiff_d18));
        console.log(`Diff BeEur: ${diff}%`);

        expect(diff).to.be.closeTo(0, 1);
    });

    it("should mint bdeur when CR = 1 [for WBTC]", async () => {
        const bdEur = await getBdEur(hre);

        const { btcInEurPrice_1e12, btcInEurPrice } = await getOnChainBtcEurPrice(hre);

        const testUser = await getUser(hre);
        const collateralAmount = 10;
        
        await lockBdEurCrAt(hre, 1);
        
        const bdEurBefore_d18 = await bdEur.balanceOf(testUser.address);

        await perform1To1MintingForWbtc(hre, testUser, collateralAmount);
        
        const bdEurAfter_d18 = await bdEur.balanceOf(testUser.address);

        console.log("btcInEurPrice: " + d12_ToNumber(btcInEurPrice_1e12));

        const expectedBdEurDiff_d18 = btcInEurPrice_1e12.mul(to_d18(collateralAmount)).div(1e12);
        const actualBdEurDiff_d18 = bdEurAfter_d18.sub(bdEurBefore_d18);
        const diff = diffPct(actualBdEurDiff_d18, expectedBdEurDiff_d18);

        console.log("BeEur before: " + d18_ToNumber(bdEurBefore_d18));
        console.log("BeEur after : " + d18_ToNumber(bdEurAfter_d18));
        console.log("Expected BeEur: " + d18_ToNumber(expectedBdEurDiff_d18));
        console.log("Actual   BeEur: " + d18_ToNumber(actualBdEurDiff_d18));
        console.log(`Diff BeEur: ${diff}%`);

        expect(diff).to.be.closeTo(0, 1);
    });

    it("minting should throw when CR < 1", async () => {
        const testUser = await getUser(hre);
        const collateralAmount = 10;

        await lockBdEurCrAt(hre, 0.7);

        await expect((async () => {
            await (await perform1To1MintingForWeth(hre, testUser, collateralAmount))
        })()).to.be.rejectedWith("revert Collateral ratio must be >= 1");
    });

    it("should redeem bdeur when CR = 1", async () => {
        const ownerUser = await getDeployer(hre);
        const testUser = await getUser(hre);

        const weth = await getWeth(hre);
        const bdEurPool = await getBdEurWethPool(hre);

        await lockBdEurCrAt(hre, 1);

        const { ethInEurPrice_1e12, ethInEurPrice } = await getOnChainEthEurPrice(hre);        
        
        const bdEur = await getBdEur(hre);

        await bdEur.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeur to user so user can redeem it

        var bdEurBalanceBeforeRedeem = await bdEur.balanceOf(testUser.address);
        var wethBalanceBeforeRedeem = await weth.balanceOf(testUser.address);

        await bdEur.connect(testUser).approve(bdEurPool.address, bdEurBalanceBeforeRedeem);

        const bdEurToRedeem =  to_d18(100);

        const expectedWethForRedeem = bdEurToRedeem.mul(1e12).div(ethInEurPrice_1e12);

        await bdEurPool.connect(testUser).redeem1t1BD(bdEurToRedeem, 1);
        await bdEurPool.connect(testUser).collectRedemption();

        var bdEurBalanceAfterRedeem = await bdEur.balanceOf(testUser.address);
        var wethBalanceAfterRedeem = await weth.balanceOf(testUser.address);

        console.log("bdEur balance before redeem: " + d18_ToNumber(bdEurBalanceBeforeRedeem));
        console.log("bdEur balance after redeem:  " + d18_ToNumber(bdEurBalanceAfterRedeem));
        
        console.log("weth balance before redeem:  " + d18_ToNumber(wethBalanceBeforeRedeem));
        console.log("weth balance after redeem:   " + d18_ToNumber(wethBalanceAfterRedeem));

        const wethDelta = d18_ToNumber(wethBalanceAfterRedeem.sub(wethBalanceBeforeRedeem));
        console.log("weth balance delta: " + wethDelta);

        const bdEurDelta = d18_ToNumber(bdEurBalanceBeforeRedeem.sub(bdEurBalanceAfterRedeem));
        console.log("bdEur balance delta: " + bdEurDelta);

        expect(bdEurBalanceBeforeRedeem).to.be.gt(0);
        expect(bdEurDelta).to.eq(d18_ToNumber(bdEurToRedeem), "unexpected bdeur delta");
        expect(wethDelta).to.eq(d18_ToNumber(expectedWethForRedeem), "unexpected weth delta");
    });

    it("redeeming should throw when CR != 1", async () => {
        const testUser = await getUser(hre);

        await lockBdEurCrAt(hre, 0.7);
        
        const bdEurPool = await getBdEurWethPool(hre);
        
        const bdEur = await getBdEur(hre);

        await bdEur.transfer(testUser.address, to_d18(100)); // deployer gives some bdeur to user so user can redeem it

        await bdEur.connect(testUser).approve(bdEurPool.address, 100);

        await expect((async () => {
            await bdEurPool.connect(testUser).redeem1t1BD(to_d18(100), 1);
        })()).to.be.rejectedWith("Collateral ratio must be == 1");
    });
})

export async function perform1To1MintingForWeth(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, collateralAmount: number){
    const bdEurPool = await getBdEurWethPool(hre);
  
    const weth = await getWeth(hre);
  
    await weth.connect(user).deposit({ value: to_d18(1000) });
    await weth.connect(user).approve(bdEurPool.address, to_d18(collateralAmount));
    await bdEurPool.connect(user).mint1t1BD(to_d18(collateralAmount), to_d18(1));
}

export async function perform1To1MintingForWbtc(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, wbtcAmount: number){
    const bdEurPool = await getBdEurWbtcPool(hre);
    const wbtc = await getWbtc(hre);
    
    await mintWbtcFromEth(hre, user, to_d18(wbtcAmount*100));
    
    await wbtc.connect(user).approve(bdEurPool.address, to_d8(wbtcAmount));
    await bdEurPool.connect(user).mint1t1BD(to_d8(wbtcAmount), to_d18(1));
}