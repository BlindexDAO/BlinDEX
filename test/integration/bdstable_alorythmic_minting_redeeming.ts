import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct } from "../../utils/Helpers";
import { toErc20, erc20ToNumber, numberToBigNumberFixed } from "../../utils/Helpers"
import { BdStablePool } from "../../typechain/BdStablePool";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { refreshRatios } from "../helpers/bdStable";
import { getBdEur, getBdx, getWeth } from "../helpers/common";
import { provideLiquidity_BDX_WETH_userTest1 } from "../helpers/swaps";
import { getOnChainEthEurPrice } from "../helpers/common";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function performMinting(testUser: SignerWithAddress, collateralAmount: number){
    const [ ownerUser ] = await hre.ethers.getSigners();

    const bdEurPool = await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;

    await refreshRatios(hre);
    
    await bdEurPool.connect(testUser).mintAlgorithmicBdStable((toErc20(collateralAmount)), (toErc20(1)));
}

describe("BDStable algorythmic", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    it.only("should mint bdeur when CR = 0", async () => {
        const [ ownerUser ] = await hre.ethers.getSigners();
        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEurPool = await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;

        await bdx.mint(testUser.address, toErc20(10000));

        const ethInBdxPrice = 1000;
        const ethInBdxPrice_1e12 = numberToBigNumberFixed(ethInBdxPrice, 12);

        const collateralAmount = 10;

        const expectedWeth = await weth.balanceOf(testUser.address);

        await provideLiquidity_BDX_WETH_userTest1(hre, ethInBdxPrice);

        await bdx.connect(testUser).approve(bdEurPool.address, toErc20(10*ethInBdxPrice));
        await performMinting(testUser, collateralAmount);

        const expectedBdx = ethInBdxPrice_1e12.mul(toErc20(collateralAmount)).div(1e12);
        const actualBdx = await bdx.balanceOf(testUser.address);  
        const diffBdx = diffPct(actualBdx, expectedBdx);

        const actualWeth = await weth.balanceOf(testUser.address);
        const diffWeth = diffPct(expectedWeth, actualWeth);

        console.log(`Diff BDX: ${diffBdx}%`);
        console.log(`Diff Weth: ${diffWeth}%`);

        expect(diffBdx).to.be.closeTo(0, 0.1);
        expect(diffWeth).to.be.closeTo(0, 0.1);
    });

    it("should redeem bdeur when CR = 0", async () => {
        const [ ownerUser ] = await hre.ethers.getSigners();
        const weth = await getWeth(hre);

        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const { ethInEurPrice_1e12, ethInEurPrice } = await getOnChainEthEurPrice(hre);

        const collateralAmount = 10;

        await provideLiquidity_BDX_WETH_userTest1(hre, ethInEurPrice);
        await performMinting(testUser, collateralAmount);

        const bdEurPool = await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;
        
        const bdEur = await getBdEur(hre);

        var bdEurBalanceBeforeRedeem = await bdEur.balanceOf(testUser.address);
        var wethBalanceBeforeRedeem = await weth.balanceOf(testUser.address);

        await bdEur.connect(testUser).approve(bdEurPool.address, bdEurBalanceBeforeRedeem);

        await bdEurPool.connect(testUser).redeem1t1BD(bdEurBalanceBeforeRedeem, toErc20(1));
        await bdEurPool.connect(testUser).collectRedemption();

        var bdEurBalanceAfterRedeem = await bdEur.balanceOf(testUser.address);
        var wethBalanceAfterRedeem = await weth.balanceOf(testUser.address);

        console.log("bdEur balance before redeem: " + erc20ToNumber(bdEurBalanceBeforeRedeem));
        console.log("bdEur balance after redeem:  " + erc20ToNumber(bdEurBalanceAfterRedeem));
        
        console.log("weth balance before redeem:  " + erc20ToNumber(wethBalanceBeforeRedeem));
        console.log("weth balance after redeem:   " + erc20ToNumber(wethBalanceAfterRedeem));

        const wethDelta = erc20ToNumber(wethBalanceAfterRedeem.sub(wethBalanceBeforeRedeem));
        console.log("weth balance delta: " + wethDelta);

        expect(bdEurBalanceBeforeRedeem).to.be.gt(0);
        expect(bdEurBalanceAfterRedeem).to.eq(0);
        expect(wethDelta).to.eq(collateralAmount)
    });
})
