import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct } from "../../utils/Helpers";
import * as constants from '../../utils/Constants'
import { swapWethFor, swapWethAsDeployer, swapForWethAsDeployer } from "../helpers/swaps"
import { to_d18, d18_ToNumber } from "../../utils/Helpers"
import { WETH } from "../../typechain/WETH";
import { BdStablePool } from "../../typechain/BdStablePool";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { lockBdEurCrAt, updateBdxOracleRefreshRatiosBdEur } from "../helpers/bdStable";
import { getBdEur, getBdEurWbtcPool, getBdEurWethPool, getDeployer, getOnChainEthEurPrice, getUser, getWeth } from "../helpers/common";
import { provideLiquidity_BDEUR_WETH_userTest1 } from "../helpers/swaps";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";
import { HardhatRuntimeEnvironment } from "hardhat/types/runtime";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe.only("BDStable 1to1", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystem(hre);
    });

    it("should mint bdeur when CR = 1", async () => {
        const bdEur = await getBdEur(hre);

        const { ethInEurPrice_1e12, ethInEurPrice } = await getOnChainEthEurPrice(hre);

        const testUser = await getUser(hre);
        const collateralAmount = 10;

        await lockBdEurCrAt(hre, 1);
        await perform1To1Minting(hre, testUser, collateralAmount);

        const expected = ethInEurPrice_1e12.mul(to_d18(collateralAmount)).div(1e12);
        const actual = await bdEur.balanceOf(testUser.address);
        const diff = diffPct(actual, expected);

        console.log(`Diff: ${diff}%`);

        expect(diff).to.be.closeTo(0, 1);
    });

    it("minting should throw when CR < 1", async () => {
        const testUser = await getUser(hre);
        const collateralAmount = 10;

        await lockBdEurCrAt(hre, 0.7);

        await expect((async () => {
            await (await perform1To1Minting(hre, testUser, collateralAmount))
        })()).to.be.rejectedWith("revert Collateral ratio must be >= 1");
    });

    it("should redeem bdeur when CR = 1", async () => {
        const ownerUser = await getDeployer(hre);
        const testUser = await getUser(hre);

        const weth = await getWeth(hre)

        await lockBdEurCrAt(hre, 1);

        const { ethInEurPrice_1e12, ethInEurPrice } = await getOnChainEthEurPrice(hre);

        const bdEurPool = await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;
        
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

export async function perform1To1Minting(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, collateralAmount: number){
    const bdEurPool = await getBdEurWethPool(hre);
  
    const weth = await getWeth(hre);
  
    await weth.connect(user).deposit({ value: to_d18(1000) });
    await weth.connect(user).approve(bdEurPool.address, to_d18(collateralAmount));
    await bdEurPool.connect(user).mint1t1BD((to_d18(collateralAmount)), (to_d18(1)));
}