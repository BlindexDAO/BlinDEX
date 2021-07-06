import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct, to_d12, to_d8 } from "../../utils/Helpers";
import { to_d18 as to_d18, d18_ToNumber, bigNumberToDecimal } from "../../utils/Helpers"
import { updateBdxOracleRefreshRatiosBdEur } from "../helpers/bdStable";
import { getBdEur, getBdx, getWeth, getWbtc, getBdEurWbtcPool, getBdEurWethPool, getDeployer, getUser } from "../helpers/common";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";
import { updateWethPair, swapEthForWbtc } from "../helpers/swaps";
import { lockBdEurCrAt } from "../helpers/bdStable";
import * as constants from '../../utils/Constants';

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Recollateralization", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    it("should recollateralize when efCR < CR", async () => {

        await setUpFunctionalSystem(hre, 0.4);

        const testUser = await getUser(hre);

        const bdx = await getBdx(hre);
        const weth = await getWeth(hre);
        const bdEur = await getBdEur(hre);
        const bdEurWethPool = await getBdEurWethPool(hre);

        await lockBdEurCrAt(hre, 0.7);

        const wethPoolBalanceBeforeRecolat_d18 = await weth.balanceOf(bdEurWethPool.address);
        const wethUserBalanceBeforeRecolat_d18 = await weth.balanceOf(testUser.address);
        
        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEurWethPool.getCollateralPrice();

        const bdEurCollatrValue_d18 = await bdEur.globalCollateralValue();
        const maxPossibleRecollateralInEur_d18 = (constants.initalBdStableToOwner_d18[hre.network.name].sub(bdEurCollatrValue_d18))
            .mul(1e12).div(wethInEurPrice_d12);

        // recollateralization
        const toRecollatInEur_d18 = maxPossibleRecollateralInEur_d18.div(2);
        const toRecollatInEth_d18 = toRecollatInEur_d18.mul(1e12).div(wethInEurPrice_d12);
        const toRecollatInEth = d18_ToNumber(toRecollatInEth_d18);

        await updateBdxOracleRefreshRatiosBdEur(hre);
        await updateWethPair(hre, "BDXShares");

        const bdxBalanceBeforeRecolat_d18 = await bdx.balanceOf(testUser.address);

        await weth.connect(testUser).approve(bdEurWethPool.address, toRecollatInEth_d18); 
        await bdEurWethPool.connect(testUser).recollateralizeBdStable(toRecollatInEth_d18, 1);

        const bdxBalanceAfterRecolat_d18 = await bdx.balanceOf(testUser.address);

        // asserts
    
        const wethPoolBalanceAfterRecolat_d18 = await weth.balanceOf(bdEurWethPool.address);
        console.log("wethPoolBalanceBeforeRecolat_d18: " + wethPoolBalanceBeforeRecolat_d18);
        console.log("wethPoolBalanceAfterRecolat_d18:  " + wethPoolBalanceAfterRecolat_d18);
        const wethPoolBalanceDelta_d18 = wethPoolBalanceAfterRecolat_d18.sub(wethPoolBalanceBeforeRecolat_d18);
        console.log("wethPoolBalanceDelta_d18:         " + wethPoolBalanceDelta_d18);
        const wethPoolBalanceDelta = d18_ToNumber(wethPoolBalanceDelta_d18);
        expect(wethPoolBalanceDelta).to.be.closeTo(toRecollatInEth, 0.001, "invalid wethPoolBalanceDelta");

        const expectedBdxBack_d18 = toRecollatInEur_d18.mul(1e12).div(bdxInEurPrice_d12).mul(10075).div(10000); // +0.75% reward
        const expectedBdxBack = d18_ToNumber(expectedBdxBack_d18);
        
        const actualBdxReward = d18_ToNumber(bdxBalanceAfterRecolat_d18.sub(bdxBalanceBeforeRecolat_d18));
        console.log(`Actual BDX reward  : ${actualBdxReward}`);
        console.log(`Expected BDX reward: ${expectedBdxBack}`);
        expect(actualBdxReward).to.be.closeTo(expectedBdxBack, 0.001, "invalid actualBdxReward");

        const wethUserBalanceAfterRecolat_d18 = await weth.balanceOf(testUser.address);
        const actualWethCost_d18 = wethUserBalanceBeforeRecolat_d18.sub(wethUserBalanceAfterRecolat_d18);
        const diffPctWethBalance = diffPct(actualWethCost_d18, toRecollatInEth_d18);
        console.log(`Diff Weth balance: ${diffPctWethBalance}%`);
        expect(diffPctWethBalance).to.be.closeTo(0, 0.001, "invalid diffPctWethBalance");
    });

    it("recollateralize should NOT fail when efCR < CR", async () => {        
        await setUpFunctionalSystem(hre, 0.3); // ~efCR

        await lockBdEurCrAt(hre, 0.9); // CR

        const testUser = await getUser(hre);
        const weth = await getWeth(hre);
        const bdEurWethPool = await getBdEurWethPool(hre);

        const toRecollatInEth_d18 = to_d18(0.001);
        await weth.connect(testUser).approve(bdEurWethPool.address, toRecollatInEth_d18); 
        await bdEurWethPool.connect(testUser).recollateralizeBdStable(toRecollatInEth_d18, 1);
    })

    it("recollateralize should fail when efCR > CR", async () => {        
        await setUpFunctionalSystem(hre, 0.9); // ~efCR

        await lockBdEurCrAt(hre, 0.3); // CR

        const testUser = await getUser(hre);
        const weth = await getWeth(hre);
        const bdEurWethPool = await getBdEurWethPool(hre);

        const toRecollatInEth_d18 = to_d18(0.001);
        await weth.connect(testUser).approve(bdEurWethPool.address, toRecollatInEth_d18); 

        await expect((async () => {
            await bdEurWethPool.connect(testUser).recollateralizeBdStable(toRecollatInEth_d18, 1);
        })()).to.be.rejectedWith("subtraction overflow");
    })
})
