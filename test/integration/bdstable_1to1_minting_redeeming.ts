import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct } from "../../utils/Helpers";
import * as constants from '../../utils/Constants'
import { swapWethFor} from "../helpers/swaps"
import { toErc20, erc20ToNumber } from "../../utils/Helpers"
import { WETH } from "../../typechain/WETH";
import { BdStablePool } from "../../typechain/BdStablePool";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { refreshRatios } from "../helpers/bdStable";
import { getBdEur, getOnChainEthEurPrice } from "../helpers/common";
import { provideLiquidity_BDEUR_WETH_userTest1 } from "../helpers/swaps";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function performMinting(testUser: SignerWithAddress, collateralAmount: number){
    const [ ownerUser ] = await hre.ethers.getSigners();

    const bdEurPool = await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;

    await refreshRatios(hre);

    const weth = await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as unknown as WETH;
    await weth.connect(testUser).deposit({ value: toErc20(1000) });

    await weth.connect(testUser).approve(bdEurPool.address, toErc20(collateralAmount));
    
    await bdEurPool.connect(testUser).mint1t1BD((toErc20(collateralAmount)), (toErc20(1)));
}

describe("BDStable 1to1", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    it("should mint bdeur when CR close to 1", async () => {
        const bdEur = await getBdEur(hre);

        const { ethInEurPrice_1e12, ethInEurPrice } = await getOnChainEthEurPrice(hre);

        const testUser = await hre.ethers.getNamedSigner('TEST2');
        const collateralAmount = 10;

        await provideLiquidity_BDEUR_WETH_userTest1(hre, ethInEurPrice);
        await performMinting(testUser, collateralAmount);

        const expected = ethInEurPrice_1e12.mul(toErc20(collateralAmount)).div(1e12);
        const actual = await bdEur.balanceOf(testUser.address);
        const diff = diffPct(actual, expected);

        console.log(`Diff: ${diff}%`);

        expect(diff).to.be.closeTo(0, 1);
    });

    it("minting should throw when CR > 1", async () => {
        const { ethInEurPrice_1e12, ethInEurPrice } = await getOnChainEthEurPrice(hre);

        const testUser = await hre.ethers.getNamedSigner('TEST2');
        const collateralAmount = 10;

        await provideLiquidity_BDEUR_WETH_userTest1(hre, ethInEurPrice * 0.5);
        
        // refresh ratios a couple times to CR has chance to change
        await refreshRatios(hre);
        await refreshRatios(hre);
        await refreshRatios(hre);

        await expect((async () => {
            await (await performMinting(testUser, collateralAmount))
        })()).to.be.rejectedWith("revert Collateral ratio must be >= 1");
    });

    it("should redeem bdeur when CR close to 1", async () => {
        const [ ownerUser ] = await hre.ethers.getSigners();
        const weth = await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as unknown as WETH;

        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const { ethInEurPrice_1e12, ethInEurPrice } = await getOnChainEthEurPrice(hre);

        const collateralAmount = 10;

        await provideLiquidity_BDEUR_WETH_userTest1(hre, ethInEurPrice);
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

    it("redeeming should throw when CR != 1", async () => {
        const [ ownerUser ] = await hre.ethers.getSigners();

        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const { ethInEurPrice_1e12, ethInEurPrice } = await getOnChainEthEurPrice(hre);

        const collateralAmount = 10;

        await provideLiquidity_BDEUR_WETH_userTest1(hre, ethInEurPrice);
        await performMinting(testUser, collateralAmount);
        
        await swapWethFor(hre, "BDEUR", collateralAmount * 0.5);

        // refresh ratios a couple times to CR has chance to change
        await refreshRatios(hre);
        await refreshRatios(hre);
        await refreshRatios(hre);

        const bdEurPool = await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;
        
        const bdEur = await getBdEur(hre);

        await bdEur.connect(testUser).approve(bdEurPool.address, 1);

        await expect((async () => {
            await bdEurPool.connect(testUser).redeem1t1BD(1, toErc20(1));
        })()).to.be.rejectedWith("Collateral ratio must be == 1");
    });
})