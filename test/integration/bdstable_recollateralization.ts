import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct, simulateTimeElapseInDays, simulateTimeElapseInSeconds } from "../../utils/Helpers";
import { to_d18 as to_d18, d18_ToNumber, numberToBigNumberFixed, bigNumberToDecimal } from "../../utils/Helpers"
import { BdStablePool } from "../../typechain/BdStablePool";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { updateBdxOracleRefreshRatiosBdEur, updateBdxOracle } from "../helpers/bdStable";
import { getBdEur, getBdx, getWeth, getWbtc, getBdEurWbtcPool, getBdEurWethPool, swapEthForWbtc } from "../helpers/common";
import { provideLiquidity_BDX_WETH_userTest1, provideLiquidity_WETH_BDEUR, provideLiquidity_WBTC_BDEUR } from "../helpers/swaps";
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

    it.only("should recollateralize when efCR < CR", async () => {
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

        const wethPoolBalanceBeforeRecolat = await weth.balanceOf(bdEurWethPool.address);
        const wethUserBalanceBeforeRecolat = await weth.balanceOf(testUser.address);
        const bdEurlBalanceBeforeRecolat = await bdEur.balanceOf(testUser.address);
        const bdxlBalanceBeforeRecolat = await bdx.balanceOf(testUser.address);

        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEurWethPool.getCollateralPrice();
        const wbtcInEurPrice_d12 = await bdEurWbtcPool.getCollateralPrice();
        const bdxPriceInWeth_d12 = BigNumber.from(1e12).mul(wethInEurPrice_d12).div(bdxInEurPrice_d12);

        console.log("--------------------");
        console.log("wethInEurPrice_d12: " + bigNumberToDecimal(wethInEurPrice_d12, 12));
        console.log("wbtcInEurPrice_d12: " + bigNumberToDecimal(wbtcInEurPrice_d12, 12));
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

        const maxPossibleRecollateral_d18 = BigNumber.from(Math.round((targetCR - effectviveCR)*1e12)).mul(to_d18(totalBdEur)).div(1e12);

        // recollateralization
        const toRecollatInEur_d18 = maxPossibleRecollateral_d18.div(2);
        const toRecollatInEth_d18 = wethInEurPrice_d12.mul(toRecollatInEur_d18).div(1e12);
        const toRecollatInEth = d18_ToNumber(toRecollatInEth_d18);

        console.log("-----------------------1");

        await updateBdxOracleRefreshRatiosBdEur(hre);
        await updateWethPair(hre, "BDXShares");

        console.log("-----------------------2");
        console.log("weth bal: " + await weth.balanceOf(testUser.address));

        await weth.connect(testUser).approve(bdEurWethPool.address, toRecollatInEth_d18); 
        await bdEurWethPool.connect(testUser).recollateralizeBdStable(toRecollatInEth_d18, 1);

        console.log("-----------------------3");
        // asserts
    
        const wethPoolBalanceAfterRecolat = await weth.balanceOf(bdEurWethPool.address);
        console.log("wethPoolBalanceAfterRecolat: " + wethPoolBalanceAfterRecolat);
        const wethPoolBalanceDelta_d18 = wethPoolBalanceAfterRecolat.sub(wethPoolBalanceBeforeRecolat);
        console.log("wethPoolBalanceDelta_d18: " + wethPoolBalanceDelta_d18);
        const wethPoolBalanceDelta = d18_ToNumber(wethPoolBalanceDelta_d18);
        expect(wethPoolBalanceDelta).to.be.closeTo(toRecollatInEth, 0.001);

        const wethUserBalanceAfterRecolat = await weth.balanceOf(testUser.address);

        // const bdxBalanceAfterMinting = await bdx.balanceOf(testUser.address);
        // const actualBdxCost = bdxlBalanceBeforeMinting.sub(bdxBalanceAfterMinting);  
        // const diffPctBdxCost = diffPct(actualBdxCost, bdxAmountForMintigBdEur_d18);
        // console.log(`Diff BDX cost: ${diffPctBdxCost}%`);
        // expect(diffPctBdxCost).to.be.closeTo(0, 0.1);

        // const wethBalanceAfterMinging = await weth.balanceOf(testUser.address);
        // const actualWethCost = wethBalanceBeforeMinting.sub(wethBalanceAfterMinging);
        // const diffPctWethBalance = diffPct(actualWethCost, wethAmountForMintigBdEur_d18);
        // console.log(`Diff Weth balance: ${diffPctWethBalance}%`);
        // expect(diffPctWethBalance).to.be.closeTo(0, 0.1);

        // const bdEurFromBdx = bdxAmountForMintigBdEur_d18.mul(bdxInEurPrice_d12).div(1e12);
        // const bdEurFromWeth = wethAmountForMintigBdEur_d18.mul(wethInEurPrice_d12).div(1e12);
        // const expectedBdEurDiff = bdEurFromBdx.add(bdEurFromWeth);
        // const bdEurBalanceAfterMinting = await bdEur.balanceOf(testUser.address);
        // const diffPctBdEur = diffPct(bdEurBalanceAfterMinting.sub(bdEurlBalanceBeforeMinting), expectedBdEurDiff);
        // console.log(`Diff BdEur balance: ${diffPctBdEur}%`);
        // expect(diffPctBdEur).to.be.closeTo(0, 0.1);

        expect(1).to.be.eq(2, "safety fail");
    });

    it("should NOT recollateralize when efCR > CR", async () => {
        expect(1).to.be.eq(2);
    });
})
