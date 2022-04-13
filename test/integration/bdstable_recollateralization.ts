import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { d12_ToNumber, diffPct } from "../../utils/NumbersHelpers";
import { to_d18 as to_d18, d18_ToNumber } from "../../utils/NumbersHelpers";
import {
  getBdEu,
  getBdx,
  getWeth,
  getBdEuWethPool,
  getDeployer,
  getUser,
  getOnChainEthFiatPrice,
  mintWeth
} from "../../utils/DeployedContractsHelpers";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import { lockBdeuCrAt } from "../helpers/bdStable";
import * as constants from "../../utils/Constants";
import { subtractionOverflowExceptionMessage } from "../helpers/common";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Recollateralization", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();
  });

  it("should recollateralize when efCR < CR", async () => {
    await setUpFunctionalSystemForTests(hre, 0.4);

    const testUser = await getUser(hre);

    const bdx = await getBdx(hre);
    const weth = await getWeth(hre);
    const bdEu = await getBdEu(hre);
    const bdEuWethPool = await getBdEuWethPool(hre);

    await lockBdeuCrAt(hre, 0.7);

    await mintWeth(hre, testUser, to_d18(100));

    const wethPoolBalanceBeforeRecolat_d18 = await weth.balanceOf(bdEuWethPool.address);
    const wethUserBalanceBeforeRecolat_d18 = await weth.balanceOf(testUser.address);

    const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
    const wethInEurPrice_d12 = await bdEuWethPool.getCollateralPrice_d12();

    const bdEuCollatrValue_d18 = await bdEu.globalCollateralValue();
    const maxPossibleRecollateralInEur_d18 = constants
      .initialBdstableMintingAmount(hre.network.name, "BDEU")
      .sub(bdEuCollatrValue_d18)
      .mul(1e12)
      .div(wethInEurPrice_d12);

    // recollateralization
    const toRecollatInEur_d18 = maxPossibleRecollateralInEur_d18.div(2);
    const toRecollatInEth_d18 = toRecollatInEur_d18.mul(1e12).div(wethInEurPrice_d12);
    const toRecollatInEth = d18_ToNumber(toRecollatInEth_d18);

    const bdxBalanceBeforeRecolat_d18 = await bdx.balanceOf(testUser.address);
    const bdEuBdxBalanceBeforeRecolat_d18 = await bdx.balanceOf(bdEu.address);

    await weth.connect(testUser).approve(bdEuWethPool.address, toRecollatInEth_d18);
    await bdEuWethPool.connect(testUser).recollateralizeBdStable(toRecollatInEth_d18, 1, false, {});

    const bdxBalanceAfterRecolat_d18 = await bdx.balanceOf(testUser.address);

    // asserts

    const wethPoolBalanceAfterRecolat_d18 = await weth.balanceOf(bdEuWethPool.address);
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

    const expecedBdEuBdx = d18_ToNumber(bdEuBdxBalanceBeforeRecolat_d18.sub(expectedBdxBack_d18));
    const bdEuBdxBalanceAfterRecolat = d18_ToNumber(await bdx.balanceOf(bdEu.address));

    expect(bdEuBdxBalanceAfterRecolat).to.be.closeTo(expecedBdEuBdx, 0.001, "invalid bdEu bdx balance");
  });

  it("recollateralize should NOT fail when efCR < CR", async () => {
    await setUpFunctionalSystemForTests(hre, 0.3); // ~efCR
    const testUser = await getUser(hre);
    const weth = await getWeth(hre);

    await lockBdeuCrAt(hre, 0.9); // CR

    await mintWeth(hre, testUser, to_d18(100));

    const bdEuWethPool = await getBdEuWethPool(hre);

    const toRecollatInEth_d18 = to_d18(0.001);
    await weth.connect(testUser).approve(bdEuWethPool.address, toRecollatInEth_d18);
    await bdEuWethPool.connect(testUser).recollateralizeBdStable(toRecollatInEth_d18, 1, false, {});
  });

  it("recollateralize should fail when efCR > CR", async () => {
    await setUpFunctionalSystemForTests(hre, 0.9); // ~efCR

    await lockBdeuCrAt(hre, 0.3); // CR

    const testUser = await getUser(hre);
    const weth = await getWeth(hre);
    const bdEuWethPool = await getBdEuWethPool(hre);

    const toRecollatInEth_d18 = to_d18(0.001);
    await weth.connect(testUser).approve(bdEuWethPool.address, toRecollatInEth_d18);

    await expect(
      (async () => {
        await bdEuWethPool.connect(testUser).recollateralizeBdStable(toRecollatInEth_d18, 1, false, {});
      })()
    ).to.be.rejectedWith(subtractionOverflowExceptionMessage);
  });

  it("recollateralize should reward bdx in BDX CR amount", async () => {
    await setUpFunctionalSystemForTests(hre, 0.3); // ~efCR

    const deployer = await getDeployer(hre);
    const testUser = await hre.ethers.getNamedSigner("TEST2");

    const bdx = await getBdx(hre);
    const bdEu = await getBdEu(hre);
    const bdEuPool = await getBdEuWethPool(hre);
    const weth = await getWeth(hre);

    const cr = 0.9;
    await lockBdeuCrAt(hre, cr); // CR

    const wethPrice = (await getOnChainEthFiatPrice(hre, "EUR")).price;
    const bdxPrice = d12_ToNumber(await bdEu.BDX_price_d12());

    const bdxLeftInBdEu_d18 = to_d18(6);
    const bdxToRemoveFromBdEu_d18 = (await bdx.balanceOf(bdEu.address)).sub(bdxLeftInBdEu_d18);
    await bdEu.transfer_bdx(deployer.address, bdxToRemoveFromBdEu_d18); // deployer takes bdx form bdEu to decrease effective BDX CR

    await mintWeth(hre, testUser, to_d18(100));

    const bdxEfCr = d12_ToNumber(await bdEu.get_effective_bdx_coverage_ratio());
    expect(bdxEfCr).to.be.lt(1, "bdxEfCr should be < 1"); // test validation

    const bdEuBdxBalanceBefore_d18 = await bdx.balanceOf(bdEu.address);
    const userBdxBalanceBefore_d18 = await bdx.balanceOf(testUser.address);

    //act
    const toRecollatInEth_d18 = to_d18(0.001);
    await weth.connect(testUser).approve(bdEuPool.address, toRecollatInEth_d18);
    await bdEuPool.connect(testUser).recollateralizeBdStable(toRecollatInEth_d18, 1, false, {});

    const bdEuBdxBalanceAfter_d18 = await bdx.balanceOf(bdEu.address);
    const userBdxBalanceAfter_d18 = await bdx.balanceOf(testUser.address);

    console.log("toRecollatInEth_d18: " + toRecollatInEth_d18);
    console.log("bdxEfCr: " + bdxEfCr);
    console.log("bdEuBdxBalanceBefore_d18: " + bdEuBdxBalanceBefore_d18);
    console.log("bdEuBdxBalanceAfter_d18: " + bdEuBdxBalanceAfter_d18);
    console.log("bdxPrice: " + bdxPrice);
    console.log("wethPrice: " + wethPrice);

    const expectedBdxDiffInBdEu = (d18_ToNumber(toRecollatInEth_d18) * wethPrice * bdxEfCr) / bdxPrice;
    console.log("expectedBdxDiffInBdEu: " + expectedBdxDiffInBdEu);

    const actualBdxDiffInBdEu = d18_ToNumber(bdEuBdxBalanceAfter_d18.sub(bdEuBdxBalanceBefore_d18));
    console.log("actualBdxDiffInBdEu: " + actualBdxDiffInBdEu);

    const actualBdxDiffInUser = d18_ToNumber(userBdxBalanceAfter_d18.sub(userBdxBalanceBefore_d18));
    console.log("actualBdxDiffInUser: " + actualBdxDiffInUser);

    expect(actualBdxDiffInBdEu).to.be.closeTo(-expectedBdxDiffInBdEu, 1e-3, "invalid bdx diff in bdEu");
    expect(actualBdxDiffInUser).to.be.closeTo(expectedBdxDiffInBdEu, 1e-3, "invalid bdx diff in user");
  });

  it("should recollateralize native token", async () => {
    await setUpFunctionalSystemForTests(hre, 0.3); // ~efCR
    const testUser = await getUser(hre);
    const weth = await getWeth(hre);

    await lockBdeuCrAt(hre, 0.9); // CR

    const bdEuWethPool = await getBdEuWethPool(hre);

    const toRecollatInEth_d18 = to_d18(0.0001);

    const poolWethBalanceBefore_d18 = await weth.balanceOf(bdEuWethPool.address);
    const userEthBalanceBefore_d18 = await hre.ethers.provider.getBalance(testUser.address);

    await bdEuWethPool.connect(testUser).recollateralizeBdStable(toRecollatInEth_d18, 1, true, { value: toRecollatInEth_d18 });

    const poolWethBalanceAfter_d18 = await weth.balanceOf(bdEuWethPool.address);
    const userEthBalanceAfter_d18 = await hre.ethers.provider.getBalance(testUser.address);

    const poolWethBalanceDiff_d18 = poolWethBalanceAfter_d18.sub(poolWethBalanceBefore_d18);
    const userEthBalanceDiff_d18 = userEthBalanceBefore_d18.sub(userEthBalanceAfter_d18);

    console.log("poolWethBalanceAfter_d18:  " + userEthBalanceBefore_d18);
    console.log("poolWethBalanceBefore_d18: " + userEthBalanceAfter_d18);
    console.log("poolWethBalanceDiff_d18  : " + userEthBalanceDiff_d18);

    expect(poolWethBalanceDiff_d18).to.be.eq(toRecollatInEth_d18, "pool weth balance diff invalid");
  });
});
