import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { d12_ToNumber, diffPct, to_d8 } from "../../utils/Helpers";
import { to_d18, d18_ToNumber } from "../../utils/Helpers"
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { lockBdEuCrAt } from "../helpers/bdStable";
import { getBdEu, getBdEuWbtcPool, getBdEuWethPool, getDeployer, getTreasury, getOnChainBtcEurPrice, getOnChainEthEurPrice, getUser, getWbtc, getWeth, mintWbtc as mintWbtcFromEth } from "../helpers/common";
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

    it("should mint bdeu when CR = 1 [for WETH]", async () => {
        const bdEu = await getBdEu(hre);

        const ethInEurPrice_1e12 = (await getOnChainEthEurPrice(hre)).price_1e12;

        const testUser = await getUser(hre);
        const collateralAmount = 10;

        await lockBdEuCrAt(hre, 1);

        const bdEuBefore_d18 = await bdEu.balanceOf(testUser.address);

        await perform1To1MintingForWeth(hre, testUser, collateralAmount);

        const bdEuAfter_d18 = await bdEu.balanceOf(testUser.address);

        console.log("ethInEurPrice: " + d12_ToNumber(ethInEurPrice_1e12));

        const expectedBdEuDiff_d18 = ethInEurPrice_1e12.mul(to_d18(collateralAmount)).div(1e12);
        const actualBdEuDiff_d18 = bdEuAfter_d18.sub(bdEuBefore_d18);
        const diff = diffPct(actualBdEuDiff_d18, expectedBdEuDiff_d18);

        console.log("BeEur before: " + d18_ToNumber(bdEuBefore_d18));
        console.log("BeEur after : " + d18_ToNumber(bdEuAfter_d18));
        console.log("Expected BeEur: " + d18_ToNumber(expectedBdEuDiff_d18));
        console.log("Actual BeEur  : " + d18_ToNumber(actualBdEuDiff_d18));
        console.log(`Diff BeEur: ${diff}%`);

        expect(diff).to.be.closeTo(0, 1);
    });

    it("should mint bdeu when CR = 1 [for WBTC]", async () => {
        const bdEu = await getBdEu(hre);

        const btcInEurPrice_1e12 = (await getOnChainBtcEurPrice(hre)).price_1e12;

        const testUser = await getUser(hre);
        const collateralAmount = 10;

        await lockBdEuCrAt(hre, 1);
        
        const bdEuBefore_d18 = await bdEu.balanceOf(testUser.address);

        await perform1To1MintingForWbtc(hre, testUser, collateralAmount);
        
        const bdEuAfter_d18 = await bdEu.balanceOf(testUser.address);

        console.log("btcInEurPrice: " + d12_ToNumber(btcInEurPrice_1e12));

        const expectedBdEuDiff_d18 = btcInEurPrice_1e12.mul(to_d18(collateralAmount)).div(1e12);
        const actualBdEuDiff_d18 = bdEuAfter_d18.sub(bdEuBefore_d18);
        const diff = diffPct(actualBdEuDiff_d18, expectedBdEuDiff_d18);

        console.log("BeEur before: " + d18_ToNumber(bdEuBefore_d18));
        console.log("BeEur after : " + d18_ToNumber(bdEuAfter_d18));
        console.log("Expected BeEur: " + d18_ToNumber(expectedBdEuDiff_d18));
        console.log("Actual   BeEur: " + d18_ToNumber(actualBdEuDiff_d18));
        console.log(`Diff BeEur: ${diff}%`);

        // we need a big tolerance due to price divergence in different sources 
        // [eth-btc chainlink * eth-fiat chainlink (in contract)] vs [direct btc-fiat chinlink price (in test)]
        expect(diff).to.be.closeTo(0, 2);
    });

    it("minting should throw when CR < 1", async () => {
        const testUser = await getUser(hre);
        const collateralAmount = 10;

        await lockBdEuCrAt(hre, 0.7);

        await expect((async () => {
            await (await perform1To1MintingForWeth(hre, testUser, collateralAmount))
        })()).to.be.rejectedWith("Collateral ratio must be >= 1");
    });

    it("should redeem bdeu when CR = 1", async () => {
        const ownerUser = await getDeployer(hre);
        const testUser = await getUser(hre);

        const weth = await getWeth(hre);
        const bdEuPool = await getBdEuWethPool(hre);

        await lockBdEuCrAt(hre, 1);

        const ethInEurPrice_1e12 = (await getOnChainEthEurPrice(hre)).price_1e12;
        
        const bdEu = await getBdEu(hre);

        await bdEu.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeu to user so user can redeem it

        var bdEuBalanceBeforeRedeem = await bdEu.balanceOf(testUser.address);
        var wethBalanceBeforeRedeem = await weth.balanceOf(testUser.address);

        await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem);

        const bdEuToRedeem =  to_d18(100);

        const efCr_d12 = await bdEu.effective_global_collateral_ratio_d12();

        expect(d12_ToNumber(efCr_d12)).to.be.lt(1, "effective collateral ration shold be less than 1"); // test validation

        const expectedWethForRedeem = bdEuToRedeem.mul(1e12).div(ethInEurPrice_1e12).mul(efCr_d12).div(1e12);

        await bdEuPool.connect(testUser).redeem1t1BD(bdEuToRedeem, 1);
        await bdEuPool.connect(testUser).collectRedemption();

        var bdEuBalanceAfterRedeem = await bdEu.balanceOf(testUser.address);
        var wethBalanceAfterRedeem = await weth.balanceOf(testUser.address);

        console.log("bdEu balance before redeem: " + d18_ToNumber(bdEuBalanceBeforeRedeem));
        console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem));
        
        console.log("weth balance before redeem:  " + d18_ToNumber(wethBalanceBeforeRedeem));
        console.log("weth balance after redeem:   " + d18_ToNumber(wethBalanceAfterRedeem));

        const wethDelta = d18_ToNumber(wethBalanceAfterRedeem.sub(wethBalanceBeforeRedeem));
        console.log("weth balance delta: " + wethDelta);

        const bdEuDelta = d18_ToNumber(bdEuBalanceBeforeRedeem.sub(bdEuBalanceAfterRedeem));
        console.log("bdEu balance delta: " + bdEuDelta);

        expect(bdEuBalanceBeforeRedeem).to.be.gt(0);
        expect(bdEuDelta).to.be.closeTo(d18_ToNumber(bdEuToRedeem), 1e-6, "unexpected bdeu delta");
        expect(wethDelta).to.be.closeTo(d18_ToNumber(expectedWethForRedeem), 1e-6, "unexpected weth delta");
    });

    it("redeeming should throw when CR != 1", async () => {
        const testUser = await getUser(hre);

        await lockBdEuCrAt(hre, 0.7);
        
        const bdEuPool = await getBdEuWethPool(hre);
        
        const bdEu = await getBdEu(hre);

        await bdEu.transfer(testUser.address, to_d18(100)); // deployer gives some bdeu to user so user can redeem it

        await bdEu.connect(testUser).approve(bdEuPool.address, 100);

        await expect((async () => {
            await bdEuPool.connect(testUser).redeem1t1BD(to_d18(100), 1);
        })()).to.be.rejectedWith("Collateral ratio must be == 1");
    });

    it("should tax illegal 1to1 redemption", async () => {
        const ownerUser = await getDeployer(hre);
        const testUser = await getUser(hre);
        const treasury = await getTreasury(hre);

        const weth = await getWeth(hre);
        const bdEuPool = await getBdEuWethPool(hre);
        const bdEu = await getBdEu(hre);

        await lockBdEuCrAt(hre, 1);
        
        // setup bdEu so it's illegal to redeem for testUser
        const collateralAmount = 0.1;
        await perform1To1MintingForWeth(hre, testUser, collateralAmount);
        await bdEu.setMinimumSwapsDelayInBlocks(100);

        const ethInEurPrice_1e12 = (await getOnChainEthEurPrice(hre)).price_1e12;

        await bdEu.transfer(testUser.address, to_d18(1000)); // deployer gives some bdeu to user so user can redeem it

        var bdEuBalanceBeforeRedeem = await bdEu.balanceOf(testUser.address);
        var wethBalanceBeforeRedeem = await weth.balanceOf(testUser.address);
        var wethBalanceBeforeRedeemTreasury = await weth.balanceOf(treasury.address);

        await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem);

        const bdEuToRedeem =  to_d18(100);

        const efCr_d12 = await bdEu.effective_global_collateral_ratio_d12();

        expect(d12_ToNumber(efCr_d12)).to.be.lt(1, "effective collateral ration shold be less than 1"); // test validation

        const expectedWethForRedeem = bdEuToRedeem.mul(1e12).div(ethInEurPrice_1e12).mul(efCr_d12).div(1e12);
        const expectedWethForRedeemUser = expectedWethForRedeem.div(10);
        const expectedWethForRedeemTreasury = expectedWethForRedeem.mul(9).div(10);

        await bdEuPool.connect(testUser).redeem1t1BD(bdEuToRedeem, 1);
        await bdEuPool.connect(testUser).collectRedemption();
        await bdEuPool.connect(treasury).collectRedemption();

        var bdEuBalanceAfterRedeem = await bdEu.balanceOf(testUser.address);
        var wethBalanceAfterRedeem = await weth.balanceOf(testUser.address);
        var wethBalanceAfterRedeemTreasury = await weth.balanceOf(treasury.address);

        console.log("bdEu balance before redeem: " + d18_ToNumber(bdEuBalanceBeforeRedeem));
        console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem));
        
        console.log("weth balance before redeem:  " + d18_ToNumber(wethBalanceBeforeRedeem));
        console.log("weth balance after redeem:   " + d18_ToNumber(wethBalanceAfterRedeem));

        console.log("weth balance before redeem (tresury):  " + d18_ToNumber(wethBalanceBeforeRedeemTreasury));
        console.log("weth balance after redeem (tresury) :   " + d18_ToNumber(wethBalanceAfterRedeemTreasury));

        const wethDelta = d18_ToNumber(wethBalanceAfterRedeem.sub(wethBalanceBeforeRedeem));
        console.log("weth balance delta: " + wethDelta);

        const wethDeltaTreasury = d18_ToNumber(wethBalanceAfterRedeemTreasury.sub(wethBalanceBeforeRedeemTreasury));
        console.log("weth balance delta: " + wethDeltaTreasury);

        const bdEuDelta = d18_ToNumber(bdEuBalanceBeforeRedeem.sub(bdEuBalanceAfterRedeem));
        console.log("bdEu balance delta: " + bdEuDelta);

        expect(bdEuBalanceBeforeRedeem).to.be.gt(0);
        expect(bdEuDelta).to.eq(d18_ToNumber(bdEuToRedeem), "unexpected bdeu delta");
        expect(wethDelta).to.be.closeTo(d18_ToNumber(expectedWethForRedeemUser), 1e-6, "unexpected weth delta (user)");
        expect(wethDeltaTreasury).to.be.closeTo(d18_ToNumber(expectedWethForRedeemTreasury), 1e-6, "unexpected weth delta (treasury)");
    });

})

export async function perform1To1MintingForWeth(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, collateralAmount: number){
    const bdEuPool = await getBdEuWethPool(hre);
  
    const weth = await getWeth(hre);
  
    await weth.connect(user).deposit({ value: to_d18(1000) });
    await weth.connect(user).approve(bdEuPool.address, to_d18(collateralAmount));
    await bdEuPool.connect(user).mint1t1BD(to_d18(collateralAmount), to_d18(1));
}

export async function perform1To1MintingForWbtc(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, wbtcAmount: number){
    const bdEuPool = await getBdEuWbtcPool(hre);
    const wbtc = await getWbtc(hre);
    
    await mintWbtcFromEth(hre, user, to_d18(wbtcAmount*100));
    
    await wbtc.connect(user).approve(bdEuPool.address, to_d8(wbtcAmount));
    await bdEuPool.connect(user).mint1t1BD(to_d8(wbtcAmount), to_d18(1));
}