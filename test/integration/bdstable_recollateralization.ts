import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct } from "../../utils/Helpers";
import { to_d18 as to_d18, d18_ToNumber, numberToBigNumberFixed, bigNumberToDecimal } from "../../utils/Helpers"
import { BdStablePool } from "../../typechain/BdStablePool";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { updateBdxOracleRefreshRatiosBdEur, updateBdxOracle, perform1To1Minting as performBdEur1To1Minting } from "../helpers/bdStable";
import { getBdEur, getBdx, getWeth, getWbtc, getBdEurWbtcPool, getBdEurWethPool, swapEthForWbtc } from "../helpers/common";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";
import { provideLiquidity_BDX_WETH_userTest1, provideLiquidity_WETH_BDEUR, provideLiquidity_WBTC_BDEUR, provideLiquidity_BDEUR_WETH_userTest1 } from "../helpers/swaps";
import { getOnChainEthEurPrice } from "../helpers/common";
import { updateWethPair } from "../helpers/swaps";
import { BigNumber } from "ethers";
import { BDXShares } from "../../typechain/BDXShares";
import { BDStable } from "../../typechain/BdStable";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function mintInitalBdx_MoveCrTo0_7(user: SignerWithAddress, wethToLiquidity: number, bdEurWeth: number, wbtcToLiquidity: number, bdEurWbtc: number, ethInBdxPrice: number) {
    const bdx = await getBdx(hre);
    const weth = await getWeth(hre);
    const bdEur = await getBdEur(hre);

    // set step to 1 to get CR = 0 after first refresh
    await bdEur.setBdstable_step_d12(numberToBigNumberFixed(1, 12).mul(3).div(10));

    await weth.connect(user).deposit({ value: to_d18(10000) });
    await bdx.mint(user.address, to_d18(1000000));      

    // liquidity provided by another user!
    const liquidityProvider = await hre.ethers.getNamedSigner('TEST1');
    await provideLiquidity_WETH_BDEUR(hre, wethToLiquidity, bdEurWeth, liquidityProvider);
    
    await swapEthForWbtc(hre, liquidityProvider, to_d18(1000));
    await provideLiquidity_WBTC_BDEUR(hre, wbtcToLiquidity, bdEurWbtc, liquidityProvider);
    
    await provideLiquidity_BDX_WETH_userTest1(hre, ethInBdxPrice);

    await updateBdxOracleRefreshRatiosBdEur(hre);
    await updateBdxOracle(hre);
    
    await bdEur.setBdstable_step_d12(0); // lock CR at 0.7
}

describe("Recollateralization", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    it("should recollateralize when efCR < CR", async () => {
        const testUser = await hre.ethers.getNamedSigner('TEST2');

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);
        const bdEurWethPool = await getBdEurWethPool(hre);
        const bdEurWbtcPool = await getBdEurWbtcPool(hre);

        const ethInBdxPrice = 100;
        const bdEurTotalInWethPool = 10000;
        const ethInBdEurPrice = 1000;
        const bdEurTotalInWbtcPool = 200000;
        const btcInBdEurPrice = 20000;
        const wethToLiquidity = bdEurTotalInWethPool/ethInBdEurPrice;
        const wbtcToLiquidity = bdEurTotalInWbtcPool/btcInBdEurPrice;

        const totalBdEur = bdEurTotalInWethPool + bdEurTotalInWbtcPool;

        await mintInitalBdx_MoveCrTo0_7(testUser, wethToLiquidity, bdEurTotalInWethPool, wbtcToLiquidity, bdEurTotalInWbtcPool, ethInBdxPrice);

        const wethPoolBalanceBeforeRecolat_d18 = await weth.balanceOf(bdEurWethPool.address);
        const wethUserBalanceBeforeRecolat_d18 = await weth.balanceOf(testUser.address);
        
        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEurWethPool.getCollateralPrice();
        const wbtcInEurPrice_d12 = await bdEurWbtcPool.getCollateralPrice();

        console.log("wethInEurPrice_d12: " + bigNumberToDecimal(wethInEurPrice_d12, 12));
        console.log("wbtcInEurPrice_d12: " + bigNumberToDecimal(wbtcInEurPrice_d12, 12));
        console.log("bdxInEurPrice_d12 : " + bigNumberToDecimal(bdxInEurPrice_d12, 12));
        console.log("wethToLiquidity: " + wethToLiquidity);
        console.log("wbtcToLiquidity: " + wbtcToLiquidity);

        const effectviveCR = bigNumberToDecimal(
            to_d18(bdEurTotalInWbtcPool)
                .mul(1e12)
                .div(
                    wethInEurPrice_d12.mul(to_d18(wethToLiquidity))
                        .add(wbtcInEurPrice_d12.mul(to_d18(wbtcToLiquidity)))
                .div(1e12)),
             12);
        const targetCR = 0.7

        console.log("Effective CR: " + effectviveCR);

        // assert test is valid in terms of real ETH price form oracle
        expect(targetCR - effectviveCR).to.be.gt(0, "If fails, ETH went very cheap and 'ethInBdEurPrice' needs to be updated");
        // expect(targetCR - effectviveCR).to.be.gt(0, "If fails, BTC went very cheap and 'ethInBdEurPrice' needs to be updated");

        const maxPossibleRecollateralInEur_d18 = BigNumber.from(Math.round((targetCR - effectviveCR)*1e12)).mul(to_d18(totalBdEur)).div(1e12);

        // recollateralization
        const toRecollatInEur_d18 = maxPossibleRecollateralInEur_d18.div(2);
        const toRecollatInEth_d18 = toRecollatInEur_d18.mul(1e12).div(wethInEurPrice_d12);
        const toRecollatInEth = d18_ToNumber(toRecollatInEth_d18);

        await updateBdxOracleRefreshRatiosBdEur(hre);
        await updateWethPair(hre, "BDXShares");

        const bdxBalanceBeforeRecolat = await bdx.balanceOf(testUser.address);
        await weth.connect(testUser).approve(bdEurWethPool.address, toRecollatInEth_d18); 
        await bdEurWethPool.connect(testUser).recollateralizeBdStable(toRecollatInEth_d18, 1);
        const bdxBalanceAfterRecolat = await bdx.balanceOf(testUser.address);

        // asserts
    
        const wethPoolBalanceAfterRecolat = await weth.balanceOf(bdEurWethPool.address);
        console.log("wethPoolBalanceBeforeRecolat: " + wethPoolBalanceBeforeRecolat_d18);
        console.log("wethPoolBalanceAfterRecolat:  " + wethPoolBalanceAfterRecolat);
        const wethPoolBalanceDelta_d18 = wethPoolBalanceAfterRecolat.sub(wethPoolBalanceBeforeRecolat_d18);
        console.log("wethPoolBalanceDelta_d18:     " + wethPoolBalanceDelta_d18);
        const wethPoolBalanceDelta = d18_ToNumber(wethPoolBalanceDelta_d18);
        expect(wethPoolBalanceDelta).to.be.closeTo(toRecollatInEth, 0.001);

        const expectedBdxBack_d18 = toRecollatInEur_d18.mul(1e12).div(bdxInEurPrice_d12).mul(10075).div(10000); // +0.75% reward
        const expectedBdxBack = d18_ToNumber(expectedBdxBack_d18);
        
        const actualBdxReward = d18_ToNumber(bdxBalanceAfterRecolat.sub(bdxBalanceBeforeRecolat));
        console.log(`Actual BDX reward  : ${actualBdxReward}`);
        console.log(`Expected BDX reward: ${expectedBdxBack}`);
        expect(actualBdxReward).to.be.closeTo(expectedBdxBack, 0.1);

        const wethUserBalanceAfterRecolat_d18 = await weth.balanceOf(testUser.address);
        const actualWethCost = wethUserBalanceBeforeRecolat_d18.sub(wethUserBalanceAfterRecolat_d18);
        const diffPctWethBalance = diffPct(actualWethCost, toRecollatInEth_d18);
        console.log(`Diff Weth balance: ${diffPctWethBalance}%`);
        expect(diffPctWethBalance).to.be.closeTo(0, 0.1);
    });

    it.only("tmp", async () => {
        const user = await hre.ethers.getNamedSigner('TEST1');
        await setUpFunctionalSystem(hre);
    })
})
