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

describe("BuyBack", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    it("should buy back", async () => {        
        await setUpFunctionalSystem(hre, 0.9);

        await lockBdEurCrAt(hre, 0.3); // CR

        const testUser = await getUser(hre);
        const weth = await getWeth(hre);
        const bdx = await getBdx(hre);
        const bdEur = await getBdEur(hre);
        const bdEurWethPool = await getBdEurWethPool(hre);

        const bdxAmount_d18 = to_d18(20);

        bdx.transfer(testUser.address, bdxAmount_d18.mul(3));
        
        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();
        const wethInEurPrice_d12 = await bdEurWethPool.getCollateralPrice();

        const expectedUserBdxDiff = -d18_ToNumber(bdxAmount_d18);
        const expectedUserWethDiff = d18_ToNumber(bdxAmount_d18.mul(bdxInEurPrice_d12).div(wethInEurPrice_d12));
        const expectedPoolBdxDiff = 0; // bdx is burned
        const expectedPoolWethDiff = -expectedUserWethDiff;

        const userBdxBalanceBefore_d18 = await bdx.balanceOf(testUser.address);
        const userWethBalanceBefore_d18 = await weth.balanceOf(testUser.address);
        const poolBdxBalanceBefore_d18 = await bdx.balanceOf(bdEurWethPool.address);
        const poolWethBalanceBefore_d18 = await weth.balanceOf(bdEurWethPool.address);

        await bdx.connect(testUser).approve(bdEurWethPool.address, bdxAmount_d18); 
        await bdEurWethPool.connect(testUser).buyBackBDX(bdxAmount_d18, 1);

        const userBdxBalanceAfter_d18 = await bdx.balanceOf(testUser.address);
        const userWethBalanceAfter_d18 = await weth.balanceOf(testUser.address);
        const poolBdxBalanceAfter_d18 = await bdx.balanceOf(bdEurWethPool.address);
        const poolWethBalanceAfter_d18 = await weth.balanceOf(bdEurWethPool.address);

        const userBdxDiff = d18_ToNumber(userBdxBalanceAfter_d18) - d18_ToNumber(userBdxBalanceBefore_d18);
        const userWethDiff = d18_ToNumber(userWethBalanceAfter_d18) - d18_ToNumber(userWethBalanceBefore_d18);
        const poolBdxDiff = d18_ToNumber(poolBdxBalanceAfter_d18) - d18_ToNumber(poolBdxBalanceBefore_d18);
        const poolWethDiff = d18_ToNumber(poolWethBalanceAfter_d18) - d18_ToNumber(poolWethBalanceBefore_d18);

        expect(userBdxDiff).to.be.closeTo(expectedUserBdxDiff, 0.01, "invalid user bdx diff");
        expect(userWethDiff).to.be.closeTo(expectedUserWethDiff, 0.01, "invalid user weth diff");
        expect(poolBdxDiff).to.be.closeTo(expectedPoolBdxDiff, 0.01, "invalid pool bdx diff");
        expect(poolWethDiff).to.be.closeTo(expectedPoolWethDiff, 0.01, "invalid pool weth diff");
    });

    it.only("should buy back max possible value", async () => {        
        const collateralizedFraction = 0.9;
        const cr = 0.3;

        await setUpFunctionalSystem(hre, collateralizedFraction);

        await lockBdEurCrAt(hre, cr); // CR

        const testUser = await getUser(hre);
        const bdx = await getBdx(hre);
        const bdEur = await getBdEur(hre);
        const bdEurWethPool = await getBdEurWethPool(hre);

        const bdxInEurPrice_d12 = await bdEur.BDX_price_d12();

        const maxBdxToBuyBack_d18 = (await bdEur.globalCollateralValue())
            .mul(to_d12(1-cr))
            .div(1e12)
            .mul(1e12)
            .div(bdxInEurPrice_d12);

        console.log("maxBdxToBuyBack_d18: " + maxBdxToBuyBack_d18);
        console.log("bdxInEurPrice_d12: " + bdxInEurPrice_d12);
        console.log("colat: " + await bdEur.globalCollateralValue());

        bdx.transfer(testUser.address, maxBdxToBuyBack_d18);
        
        await bdx.connect(testUser).approve(bdEurWethPool.address, maxBdxToBuyBack_d18); 
        await bdEurWethPool.connect(testUser).buyBackBDX(maxBdxToBuyBack_d18, 1);
    });

    it("should throw if no excess collateral", async () => {        
        await setUpFunctionalSystem(hre, 0.3);

        const testUser = await getUser(hre);
        const weth = await getWeth(hre);
        const bdx = await getBdx(hre);
        const bdEurWethPool = await getBdEurWethPool(hre);

        const bdxAmount_d18 = to_d18(100);

        bdx.transfer(testUser.address, bdxAmount_d18.mul(3));
        
        await bdx.connect(testUser).approve(bdEurWethPool.address, bdxAmount_d18); 

        await expect((async () => {
            await bdEurWethPool.connect(testUser).buyBackBDX(bdxAmount_d18, 1);
        })()).to.be.rejectedWith("No excess collateral to buy back!");
    });
})
