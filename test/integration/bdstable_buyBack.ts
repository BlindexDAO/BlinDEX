import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { to_d12, to_d18, d18_ToNumber } from "../../utils/NumbersHelpers";
import { getBdEu, getBdx, getWeth, getBdEuWethPool, getUser } from "../../utils/DeployedContractsHelpers";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import { lockBdEuCrAt } from "../helpers/bdStable";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BuyBack", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();
    const bdEuWethPool = await getBdEuWethPool(hre);

    // Allowing every user to buyback for our testings
    await bdEuWethPool.toggleBuybackOnlyForOwner();
  });

  it("should buy back", async () => {
    await setUpFunctionalSystemForTests(hre, 0.9);

    await lockBdEuCrAt(hre, 0.3); // CR

    const testUser = await getUser(hre);
    const weth = await getWeth(hre);
    const bdx = await getBdx(hre);
    const bdEu = await getBdEu(hre);
    const bdEuWethPool = await getBdEuWethPool(hre);

    const bdxAmount_d18 = to_d18(20);

    bdx.transfer(testUser.address, bdxAmount_d18.mul(3));

    const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
    const wethInEurPrice_d12 = await bdEuWethPool.getCollateralPrice_d12();

    const expectedUserBdxDiff = -d18_ToNumber(bdxAmount_d18);
    const expectedUserWethDiff = d18_ToNumber(bdxAmount_d18.mul(bdxInEurPrice_d12).div(wethInEurPrice_d12));
    const expectedPoolBdxDiff = 0; // bdx is burned
    const expectedPoolWethDiff = -expectedUserWethDiff;
    const expectedBdEuBdxDiff = -expectedUserBdxDiff;

    const userBdxBalanceBefore_d18 = await bdx.balanceOf(testUser.address);
    const userWethBalanceBefore_d18 = await weth.balanceOf(testUser.address);
    const poolBdxBalanceBefore_d18 = await bdx.balanceOf(bdEuWethPool.address);
    const poolWethBalanceBefore_d18 = await weth.balanceOf(bdEuWethPool.address);
    const bdEuBdxBalanceBefore_d18 = await bdx.balanceOf(bdEu.address);

    await bdx.connect(testUser).approve(bdEuWethPool.address, bdxAmount_d18);
    await bdEuWethPool.connect(testUser).buyBackBDX(bdxAmount_d18, 1, false, {});

    const userBdxBalanceAfter_d18 = await bdx.balanceOf(testUser.address);
    const userWethBalanceAfter_d18 = await weth.balanceOf(testUser.address);
    const poolBdxBalanceAfter_d18 = await bdx.balanceOf(bdEuWethPool.address);
    const poolWethBalanceAfter_d18 = await weth.balanceOf(bdEuWethPool.address);
    const bdEuBdxBalanceAfter_d18 = await bdx.balanceOf(bdEu.address);

    const userBdxDiff = d18_ToNumber(userBdxBalanceAfter_d18) - d18_ToNumber(userBdxBalanceBefore_d18);
    const userWethDiff = d18_ToNumber(userWethBalanceAfter_d18) - d18_ToNumber(userWethBalanceBefore_d18);
    const poolBdxDiff = d18_ToNumber(poolBdxBalanceAfter_d18) - d18_ToNumber(poolBdxBalanceBefore_d18);
    const poolWethDiff = d18_ToNumber(poolWethBalanceAfter_d18) - d18_ToNumber(poolWethBalanceBefore_d18);
    const bdEuBdxDiff = d18_ToNumber(bdEuBdxBalanceAfter_d18) - d18_ToNumber(bdEuBdxBalanceBefore_d18);

    expect(userBdxDiff).to.be.closeTo(expectedUserBdxDiff, 0.01, "invalid user bdx diff");
    expect(userWethDiff).to.be.closeTo(expectedUserWethDiff, 0.01, "invalid user weth diff");
    expect(poolBdxDiff).to.be.closeTo(expectedPoolBdxDiff, 0.01, "invalid pool bdx diff");
    expect(poolWethDiff).to.be.closeTo(expectedPoolWethDiff, 0.01, "invalid pool weth diff");
    expect(bdEuBdxDiff).to.be.closeTo(expectedBdEuBdxDiff, 0.01, "invalid bdEu bdx diff");
  });

  it("should buy back max possible value", async () => {
    const collateralizedFraction = 0.9;
    const cr = 0.3;

    await setUpFunctionalSystemForTests(hre, collateralizedFraction);
    await lockBdEuCrAt(hre, cr);

    const testUser = await getUser(hre);
    const bdx = await getBdx(hre);
    const bdEu = await getBdEu(hre);
    const bdEuWethPool = await getBdEuWethPool(hre);
    const weth = await getWeth(hre);

    const maxBdxToBuyBack_d18 = await calculateMaxBdxToBuyBack_d18(cr);

    // The deployer sends BDX to the user so the user could buyback
    await bdx.transfer(testUser.address, maxBdxToBuyBack_d18);

    const userBdxBalanceBefore = await bdx.balanceOf(testUser.address);
    const bdEuBdxBalanceBefore = await bdx.balanceOf(bdEu.address);
    const poolWethBalanceBefore = await weth.balanceOf(bdEu.address);

    await bdx.connect(testUser).approve(bdEuWethPool.address, maxBdxToBuyBack_d18);
    await bdEuWethPool.connect(testUser).buyBackBDX(maxBdxToBuyBack_d18, 1, false, {});

    const userBdxBalanceAfter = await bdx.balanceOf(testUser.address);
    const bdEuBdxBalanceAfter = await bdx.balanceOf(bdEu.address);
    const poolWethBalanceAfter = await weth.balanceOf(bdEuWethPool.address);

    expect(userBdxBalanceBefore.sub(userBdxBalanceAfter)).to.be.eq(bdEuBdxBalanceAfter.sub(bdEuBdxBalanceBefore), "invalid bdx changes");
    expect(poolWethBalanceAfter).to.be.gt(poolWethBalanceBefore);
  });

  it("should buy back max possible value with native token", async () => {
    const collateralizedFraction = 0.9;
    const cr = 0.3;

    await setUpFunctionalSystemForTests(hre, collateralizedFraction);
    await lockBdEuCrAt(hre, cr);

    const testUser = await getUser(hre);
    const bdx = await getBdx(hre);
    const bdEuWethPool = await getBdEuWethPool(hre);
    const weth = await getWeth(hre);
    const bdEu = await getBdEu(hre);

    const maxBdxToBuyBack_d18 = await calculateMaxBdxToBuyBack_d18(cr);

    // The deployer sends BDX to the user so the user could buyback
    await bdx.transfer(testUser.address, maxBdxToBuyBack_d18);

    const userBdxBalanceBefore = await bdx.balanceOf(testUser.address);
    const bdEuBdxBalanceBefore = await bdx.balanceOf(bdEu.address);
    const poolWethBalanceBefore = await weth.balanceOf(bdEu.address);

    await bdx.connect(testUser).approve(bdEuWethPool.address, maxBdxToBuyBack_d18);
    await bdEuWethPool.connect(testUser).buyBackBDX(maxBdxToBuyBack_d18, 1, true);

    const userBdxBalanceAfter = await bdx.balanceOf(testUser.address);
    const bdEuBdxBalanceAfter = await bdx.balanceOf(bdEu.address);
    const poolWethBalanceAfter = await weth.balanceOf(bdEuWethPool.address);

    expect(userBdxBalanceBefore.sub(userBdxBalanceAfter)).to.be.eq(bdEuBdxBalanceAfter.sub(bdEuBdxBalanceBefore), "invalid bdx changes");

    expect(poolWethBalanceAfter).to.be.gt(poolWethBalanceBefore);
  });

  it("should throw if trying to buy back more than excess", async () => {
    const collateralizedFraction = 0.9;
    const cr = 0.3;

    await setUpFunctionalSystemForTests(hre, collateralizedFraction);

    await lockBdEuCrAt(hre, cr); // CR

    const testUser = await getUser(hre);
    const bdx = await getBdx(hre);
    const bdEuWethPool = await getBdEuWethPool(hre);

    // We're sending true for the useGlobalCollateralValue since we want to make sure we'll exceed the aviable excess
    // That is derived from both the weth pool and the wbtc pool
    const maxBdxToBuyBack_d18 = await calculateMaxBdxToBuyBack_d18(cr, true);

    const bdxExcess = 10; // this is a very small amout (1e-17 BDX). We cannot use 1 because of roundings and low initial price of BDX (1 BDX < 1 EUR)
    const moreThanMaxBdxToBuyBack_d18 = maxBdxToBuyBack_d18.add(bdxExcess);

    bdx.transfer(testUser.address, moreThanMaxBdxToBuyBack_d18);

    await bdx.connect(testUser).approve(bdEuWethPool.address, moreThanMaxBdxToBuyBack_d18);

    await expect(
      (async () => {
        await bdEuWethPool.connect(testUser).buyBackBDX(moreThanMaxBdxToBuyBack_d18, 1, false, {});
      })()
    ).to.be.rejectedWith("You are trying to buy back more than the excess!");
  });

  it("should throw if no excess collateral", async () => {
    await setUpFunctionalSystemForTests(hre, 0.3);

    const testUser = await getUser(hre);
    const bdx = await getBdx(hre);
    const bdEuWethPool = await getBdEuWethPool(hre);

    const bdxAmount_d18 = to_d18(10);

    bdx.transfer(testUser.address, bdxAmount_d18.mul(3));

    await bdx.connect(testUser).approve(bdEuWethPool.address, bdxAmount_d18);

    await expect(
      (async () => {
        await bdEuWethPool.connect(testUser).buyBackBDX(bdxAmount_d18, 1, false, {});
      })()
    ).to.be.rejectedWith("No excess collateral to buy back!");
  });
});

async function calculateMaxBdxToBuyBack_d18(cr: number, useGlobalCollateralValue: boolean = false) {
  const bdEu = await getBdEu(hre);
  const bdEuWethPool = await getBdEuWethPool(hre);
  const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
  let bdEuCollateralValue;

  if (useGlobalCollateralValue) {
    bdEuCollateralValue = await bdEu.globalCollateralValue();
  } else {
    // We need to check the collateral in the speicifc bdstable pool since in our tests
    // we're trying to send bacl the collateral specifically from this pool.
    // If we won't do this, the test might fail due to lack of WETh to send back to the buyback sender
    bdEuCollateralValue = await bdEuWethPool.collatFiatBalance();
  }

  const bdEuTotalSupply = await bdEu.totalSupply();
  const currentRequiredCollateralValue = bdEuTotalSupply.mul(to_d12(cr)).div(1e12);

  const maxBdxToBuyBack_d18 = bdEuCollateralValue.sub(currentRequiredCollateralValue).mul(1e12).div(bdxInEurPrice_d12);

  console.log("bdxInEurPrice_d12:              " + bdxInEurPrice_d12);
  console.log("bdeu collateral value:          " + bdEuCollateralValue);
  console.log("currentRequiredCollateralValue: " + currentRequiredCollateralValue);
  console.log("maxBdxToBuyBack_d18:            " + maxBdxToBuyBack_d18);

  return maxBdxToBuyBack_d18;
}
