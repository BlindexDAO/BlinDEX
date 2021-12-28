import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { d12_ToNumber, diffPct, to_d12, to_d8 } from "../../utils/NumbersHelpers";
import { to_d18, d18_ToNumber } from "../../utils/NumbersHelpers";
import type { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { lockBdEuCrAt } from "../helpers/bdStable";
import { getBdEu, getBdx, getWeth, getBdEuWethPool, getDeployer, mintWeth } from "../../utils/DeployedContractsHelpers";
import { BigNumber } from "ethers";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import { provideBdEu, provideBdx } from "../helpers/common";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function performFractionalMinting(testUser: SignerWithAddress, wethAmount_d18: BigNumber, bdxAmount_d18: BigNumber) {
  const bdx = await getBdx(hre);
  const bdEuPool = await getBdEuWethPool(hre);
  const weth = await getWeth(hre);

  await weth.connect(testUser).approve(bdEuPool.address, wethAmount_d18);
  await bdx.connect(testUser).approve(bdEuPool.address, bdxAmount_d18);

  await bdEuPool.connect(testUser).mintFractionalBdStable(wethAmount_d18, bdxAmount_d18, to_d18(1), false, {});
}

async function performFractionalMintingEth(testUser: SignerWithAddress, wethAmount_d18: BigNumber, bdxAmount_d18: BigNumber) {
  const bdx = await getBdx(hre);
  const bdEuPool = await getBdEuWethPool(hre);

  await bdx.connect(testUser).approve(bdEuPool.address, bdxAmount_d18);

  await bdEuPool.connect(testUser).mintFractionalBdStable(wethAmount_d18, bdxAmount_d18, to_d18(1), true, { value: wethAmount_d18 });
}

describe("BDStable fractional", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();
  });

  it("should mint bdeu when CR > 0 & CR < 1", async () => {
    await setUpFunctionalSystemForTests(hre, 1);

    const testUser = await hre.ethers.getNamedSigner("TEST2");

    const bdx = await getBdx(hre);
    const weth = await getWeth(hre);
    const bdEu = await getBdEu(hre);
    const bdEuPool = await getBdEuWethPool(hre);

    const cr = 0.7;
    await lockBdEuCrAt(hre, cr);

    await provideBdx(hre, testUser.address, to_d18(1000)); // treasury gives some bdeu to user, so user can mint
    await mintWeth(hre, testUser, to_d18(100));

    const wethBalanceBeforeMinting_d18 = await weth.balanceOf(testUser.address);
    const bdEuBalanceBeforeMinting_d18 = await bdEu.balanceOf(testUser.address);
    const bdxBalanceBeforeMinting_d18 = await bdx.balanceOf(testUser.address);
    const bdEuBdxBalanceBeforeMinting_d18 = await bdx.balanceOf(bdEu.address);

    const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
    const wethInEurPrice_d12 = await bdEuPool.getCollateralPrice_d12();
    const bdxPriceInWeth_d12 = BigNumber.from(1e12).mul(wethInEurPrice_d12).div(bdxInEurPrice_d12);

    // calculate how much is needed to mint
    const wethAmountForMintigBdEu_d18 = to_d18(0.1); // CR% of total value
    const bdxAmountForMintigBdEu_d18 = wethAmountForMintigBdEu_d18
      .mul(to_d8(1 - cr))
      .div(to_d8(cr))
      .mul(bdxPriceInWeth_d12)
      .div(1e12); // the remaining 30% of value

    const excessiveBdxAmountForMintigBdEu_d18 = bdxAmountForMintigBdEu_d18.mul(3); // the excess should be ignored

    await performFractionalMinting(testUser, wethAmountForMintigBdEu_d18, excessiveBdxAmountForMintigBdEu_d18);

    // asserts

    const bdxBalanceAfterMinting_d18 = await bdx.balanceOf(testUser.address);
    const actualBdxCost_d18 = bdxBalanceBeforeMinting_d18.sub(bdxBalanceAfterMinting_d18);
    const diffPctBdxCost = diffPct(actualBdxCost_d18, bdxAmountForMintigBdEu_d18);
    console.log(`Diff BDX cost: ${diffPctBdxCost}%`);
    expect(diffPctBdxCost).to.be.closeTo(0, 0.001, "invalid bdx diff");

    const bdEuBdxBalanceAfterMinting_d18 = await bdx.balanceOf(bdEu.address);
    const actualBdxIntoBdEu_d18 = bdEuBdxBalanceAfterMinting_d18.sub(bdEuBdxBalanceBeforeMinting_d18);
    const diffPctBdxIntoBdEu = diffPct(actualBdxIntoBdEu_d18, bdxAmountForMintigBdEu_d18);
    console.log(`Diff BDX into BdEu: ${diffPctBdxIntoBdEu}%`);
    expect(diffPctBdxIntoBdEu).to.be.closeTo(0, 0.001, "invalid bdx into bdeu diff");

    const wethBalanceAfterMinging_d18 = await weth.balanceOf(testUser.address);
    const actualWethCost_d18 = wethBalanceBeforeMinting_d18.sub(wethBalanceAfterMinging_d18);
    const diffPctWethBalance = diffPct(actualWethCost_d18, wethAmountForMintigBdEu_d18);
    console.log(`Diff Weth balance: ${diffPctWethBalance}%`);
    expect(diffPctWethBalance).to.be.closeTo(0, 0.001, "invalid weth diff");

    const bdEuFromBdx_d18 = bdxAmountForMintigBdEu_d18.mul(bdxInEurPrice_d12).div(1e12);
    const bdEuFromWeth_d18 = wethAmountForMintigBdEu_d18.mul(wethInEurPrice_d12).div(1e12);
    const expectedBdEuDiff_d18 = bdEuFromBdx_d18
      .add(bdEuFromWeth_d18)
      .mul(to_d12(1 - 0.003))
      .div(1e12); // decrease by minting fee;

    const bdEuBalanceAfterMinting_d18 = await bdEu.balanceOf(testUser.address);
    const diffPctBdEu = diffPct(bdEuBalanceAfterMinting_d18.sub(bdEuBalanceBeforeMinting_d18), expectedBdEuDiff_d18);
    console.log(`Diff BdEu balance: ${diffPctBdEu}%`);
    expect(diffPctBdEu).to.be.closeTo(0, 0.001, "invalid bdEu diff");
  });

  it("should mint bdeu when CR > 0 & CR < 1 with native token", async () => {
    await setUpFunctionalSystemForTests(hre, 1);

    const testUser = await hre.ethers.getNamedSigner("TEST2");

    const bdx = await getBdx(hre);
    const weth = await getWeth(hre);
    const bdEu = await getBdEu(hre);
    const bdEuPool = await getBdEuWethPool(hre);

    const cr = 0.7;
    await lockBdEuCrAt(hre, cr);

    await provideBdx(hre, testUser.address, to_d18(1000)); // treasury gives some bdeu to user, so user can mint
    await mintWeth(hre, testUser, to_d18(100));

    const poolWethBalanceBeforeMinting_d18 = await weth.balanceOf(bdEuPool.address);
    const bdEuBalanceBeforeMinting_d18 = await bdEu.balanceOf(testUser.address);
    const bdxBalanceBeforeMinting_d18 = await bdx.balanceOf(testUser.address);
    const bdEuBdxBalanceBeforeMinting_d18 = await bdx.balanceOf(bdEu.address);

    const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
    const wethInEurPrice_d12 = await bdEuPool.getCollateralPrice_d12();
    const bdxPriceInWeth_d12 = BigNumber.from(1e12).mul(wethInEurPrice_d12).div(bdxInEurPrice_d12);

    // calculate how much is needed to mint
    const wethAmountForMintigBdEu_d18 = to_d18(0.1); // CR% of total value
    const bdxAmountForMintigBdEu_d18 = wethAmountForMintigBdEu_d18
      .mul(to_d8(1 - cr))
      .div(to_d8(cr))
      .mul(bdxPriceInWeth_d12)
      .div(1e12); // the remaining 30% of value

    const excessiveBdxAmountForMintigBdEu_d18 = bdxAmountForMintigBdEu_d18.mul(3); // the excess should be ignored
    await performFractionalMintingEth(testUser, wethAmountForMintigBdEu_d18, excessiveBdxAmountForMintigBdEu_d18);

    // asserts

    const bdxBalanceAfterMinting_d18 = await bdx.balanceOf(testUser.address);
    const actualBdxCost_d18 = bdxBalanceBeforeMinting_d18.sub(bdxBalanceAfterMinting_d18);
    const diffPctBdxCost = diffPct(actualBdxCost_d18, bdxAmountForMintigBdEu_d18);
    console.log(`Diff BDX cost: ${diffPctBdxCost}%`);
    expect(diffPctBdxCost).to.be.closeTo(0, 0.001, "invalid bdx diff");

    const bdEuBdxBalanceAfterMinting_d18 = await bdx.balanceOf(bdEu.address);
    const actualBdxIntoBdEu_d18 = bdEuBdxBalanceAfterMinting_d18.sub(bdEuBdxBalanceBeforeMinting_d18);
    const diffPctBdxIntoBdEu = diffPct(actualBdxIntoBdEu_d18, bdxAmountForMintigBdEu_d18);
    console.log(`Diff BDX into BdEu: ${diffPctBdxIntoBdEu}%`);
    expect(diffPctBdxIntoBdEu).to.be.closeTo(0, 0.001, "invalid bdx into bdeu diff");

    const poolWethBalanceAfterMinging_d18 = await weth.balanceOf(bdEuPool.address);
    const actualWethAddedToPool_d18 = poolWethBalanceAfterMinging_d18.sub(poolWethBalanceBeforeMinting_d18);
    const diffPctWethBalance = diffPct(actualWethAddedToPool_d18, wethAmountForMintigBdEu_d18);
    console.log(`Diff pool Weth balance: ${diffPctWethBalance}%`);
    expect(diffPctWethBalance).to.be.closeTo(0, 0.001, "invalid pool weth diff");

    const bdEuFromBdx_d18 = bdxAmountForMintigBdEu_d18.mul(bdxInEurPrice_d12).div(1e12);
    const bdEuFromWeth_d18 = wethAmountForMintigBdEu_d18.mul(wethInEurPrice_d12).div(1e12);
    const expectedBdEuDiff_d18 = bdEuFromBdx_d18
      .add(bdEuFromWeth_d18)
      .mul(to_d12(1 - 0.003))
      .div(1e12); // decrease by minting fee;

    const bdEuBalanceAfterMinting_d18 = await bdEu.balanceOf(testUser.address);
    const diffPctBdEu = diffPct(bdEuBalanceAfterMinting_d18.sub(bdEuBalanceBeforeMinting_d18), expectedBdEuDiff_d18);
    console.log(`Diff BdEu balance: ${diffPctBdEu}%`);
    expect(diffPctBdEu).to.be.closeTo(0, 0.001, "invalid bdEu diff");
  });

  it("should redeem bdeu when CR > 0 & CR < 1 & efCR > CR", async () => {
    await setUpFunctionalSystemForTests(hre, 0.9); // low initial collateralization so efCR is low (for test purposes)

    const testUser = await hre.ethers.getNamedSigner("TEST2");

    const bdx = await getBdx(hre);
    const weth = await getWeth(hre);
    const bdEu = await getBdEu(hre);
    const bdEuPool = await getBdEuWethPool(hre);

    const cr = 0.7;

    await lockBdEuCrAt(hre, cr);

    const efCR_d12 = await bdEu.effective_global_collateral_ratio_d12();
    console.log("effectiveCR: " + d12_ToNumber(efCR_d12));
    expect(d12_ToNumber(efCR_d12)).to.be.gt(cr, "we want efCR > CR, for test purposes"); // test valitation

    await provideBdEu(hre, testUser.address, to_d18(1000)); // treasury gives some bdeu to user, so user can redeem
    await mintWeth(hre, testUser, to_d18(100));

    const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(testUser.address);
    const bdxBalanceBeforeRedeem_d18 = await bdx.balanceOf(testUser.address);
    const wethBalanceBeforeRedeem_d18 = await weth.balanceOf(testUser.address);

    const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
    const wethInEurPrice_d12 = await bdEuPool.getCollateralPrice_d12();

    const bdEuToRedeem_d18 = to_d18(100);

    // calculate how much is needed to mint
    const expectedWethRedemptionPayment_d18 = bdEuToRedeem_d18
      .mul(to_d12(cr))
      .div(1e12)
      .mul(1e12)
      .div(wethInEurPrice_d12)
      .mul(to_d12(1 - 0.003))
      .div(1e12); // decrease by redemption fee

    const expectedBdxRedemptionPayment_d18 = bdEuToRedeem_d18
      .mul(to_d12(1 - cr))
      .div(1e12)
      .mul(1e12)
      .div(bdxInEurPrice_d12)
      .mul(to_d12(1 - 0.003))
      .div(1e12); // decrease by redemption fee;

    await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem_d18);
    await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 1);
    await bdEuPool.connect(testUser).collectRedemption(false);

    // asserts

    const bdEuBalanceAfterRedeem_d18 = await bdEu.balanceOf(testUser.address);
    console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem_d18));
    expect(bdEuBalanceAfterRedeem_d18).to.eq(bdEuBalanceBeforeRedeem_d18.sub(bdEuToRedeem_d18), "unexpected bdEu balance");

    const wethBalanceAfterRedeem_d18 = await weth.balanceOf(testUser.address);
    const wethDelta_d18 = wethBalanceAfterRedeem_d18.sub(wethBalanceBeforeRedeem_d18);
    const wethDiffPct = diffPct(expectedWethRedemptionPayment_d18, wethDelta_d18);
    console.log("expected weth redemption payment: " + expectedWethRedemptionPayment_d18);
    console.log("weth balance delta:               " + wethDelta_d18);
    console.log("weth diff pct:                    " + wethDiffPct);
    expect(wethDiffPct).to.be.closeTo(0, 0.0001, "unexpected weth balance");

    const bdxBalanceAfterRedeem_d18 = await bdx.balanceOf(testUser.address);
    const bdxDelta_d18 = bdxBalanceAfterRedeem_d18.sub(bdxBalanceBeforeRedeem_d18);
    const bdxDiffPct = diffPct(expectedBdxRedemptionPayment_d18, bdxDelta_d18);
    console.log("expected bdx redemption payment: " + expectedBdxRedemptionPayment_d18);
    console.log("bdx balance delta:               " + bdxDelta_d18);
    console.log("bdx diff pct:                    " + bdxDiffPct);
    expect(bdxDiffPct).to.be.closeTo(0, 0.0001, "unexpected bdx balance");
  });

  it("should redeem bdeu when CR > 0 & CR < 1 & efCR < CR", async () => {
    await setUpFunctionalSystemForTests(hre, 0.4); // low initial collateralization so efCR is low (for test purposes)

    const testUser = await hre.ethers.getNamedSigner("TEST2");

    const bdx = await getBdx(hre);
    const weth = await getWeth(hre);
    const bdEu = await getBdEu(hre);
    const bdEuPool = await getBdEuWethPool(hre);

    const cr = 0.7;

    await lockBdEuCrAt(hre, cr);

    const efCR_d12 = await bdEu.effective_global_collateral_ratio_d12();
    console.log("effectiveCR: " + d12_ToNumber(efCR_d12));
    expect(d12_ToNumber(efCR_d12)).to.be.lt(cr, "we want efCR < CR, for test purposes"); // test valitation

    await provideBdEu(hre, testUser.address, to_d18(1000)); // treasury gives some bdeu to user, so user can redeem
    await mintWeth(hre, testUser, to_d18(100));

    const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(testUser.address);
    const bdxBalanceBeforeRedeem_d18 = await bdx.balanceOf(testUser.address);
    const wethBalanceBeforeRedeem_d18 = await weth.balanceOf(testUser.address);

    const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
    const wethInEurPrice_d12 = await bdEuPool.getCollateralPrice_d12();

    const bdEuToRedeem_d18 = to_d18(100);

    // calculate how much is needed to mint
    const expectedWethRedemptionPayment_d18 = bdEuToRedeem_d18
      .mul(efCR_d12)
      .div(1e12)
      .mul(1e12)
      .div(wethInEurPrice_d12)
      .mul(to_d12(1 - 0.003))
      .div(1e12); // decrease by redemption fee

    const expectedBdxRedemptionPayment_d18 = bdEuToRedeem_d18
      .mul(to_d12(1).sub(efCR_d12))
      .div(1e12)
      .mul(1e12)
      .div(bdxInEurPrice_d12)
      .mul(to_d12(1 - 0.003))
      .div(1e12); // decrease by redemption fee

    await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem_d18);
    await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 1);
    await bdEuPool.connect(testUser).collectRedemption(false);

    // asserts

    const bdEuBalanceAfterRedeem_d18 = await bdEu.balanceOf(testUser.address);
    console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem_d18));
    expect(bdEuBalanceAfterRedeem_d18).to.eq(bdEuBalanceBeforeRedeem_d18.sub(bdEuToRedeem_d18), "unexpected bdEu balance");

    const wethBalanceAfterRedeem_d18 = await weth.balanceOf(testUser.address);
    const wethDelta_d18 = wethBalanceAfterRedeem_d18.sub(wethBalanceBeforeRedeem_d18);
    const wethDiffPct = diffPct(expectedWethRedemptionPayment_d18, wethDelta_d18);
    console.log("expected weth redemption payment: " + expectedWethRedemptionPayment_d18);
    console.log("weth balance delta:               " + wethDelta_d18);
    console.log("weth diff pct:                    " + wethDiffPct);
    expect(wethDiffPct).to.be.closeTo(0, 0.0001, "unexpected weth balance");

    const bdxBalanceAfterRedeem_d18 = await bdx.balanceOf(testUser.address);
    const bdxDelta_d18 = bdxBalanceAfterRedeem_d18.sub(bdxBalanceBeforeRedeem_d18);
    const bdxDiffPct = diffPct(expectedBdxRedemptionPayment_d18, bdxDelta_d18);
    console.log("expected bdx redemption payment: " + expectedBdxRedemptionPayment_d18);
    console.log("bdx balance delta:               " + bdxDelta_d18);
    console.log("bdx diff pct:                    " + bdxDiffPct);
    expect(bdxDiffPct).to.be.closeTo(0, 0.0001, "unexpected bdx balance");
  });

  it("should fail illegal fractional redemption", async () => {
    await setUpFunctionalSystemForTests(hre, 0.9); // low initial collateralization so efCR is low (for test purposes)

    const testUser = await hre.ethers.getNamedSigner("TEST2");
    const bdEu = await getBdEu(hre);
    const bdEuPool = await getBdEuWethPool(hre);

    const cr = 0.2;

    await lockBdEuCrAt(hre, cr);

    // calculate how much is needed to mint
    await provideBdx(hre, testUser.address, to_d18(1000)); // treasury gives some bdeu to user, so user can mint
    await mintWeth(hre, testUser, to_d18(100));

    // setup bdEu so it's illegal to redeem for testUser
    await performFractionalMinting(testUser, to_d18(0.001), to_d18(100));
    await bdEu.setMinimumSwapsDelayInBlocks(100);
    // setup finished

    await provideBdEu(hre, testUser.address, to_d18(1000)); // treasury gives some bdeu to user, so user can redeem

    const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(testUser.address);

    const bdEuToRedeem_d18 = to_d18(100);

    await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem_d18);
    await expect(bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 1)).to.be.revertedWith("Cannot legally redeem");
  });

  it("redeem should reward bdx in BDX CR amount", async () => {
    await setUpFunctionalSystemForTests(hre, 1);

    const deployer = await getDeployer(hre);
    const testUser = await hre.ethers.getNamedSigner("TEST2");

    const bdx = await getBdx(hre);
    const bdEu = await getBdEu(hre);
    const bdEuPool = await getBdEuWethPool(hre);

    const bdxLeftInBdEu_d18 = to_d18(6);
    const bdxToRemoveFromBdEu_d18 = (await bdx.balanceOf(bdEu.address)).sub(bdxLeftInBdEu_d18);
    await bdEu.transfer_bdx(deployer.address, bdxToRemoveFromBdEu_d18); // deployer takes bdx form bdEu to decrease effective BDX CR

    // enable fractional redeem
    const cr = 0.7;
    await lockBdEuCrAt(hre, cr);

    const bdxEfCr = d12_ToNumber(await bdEu.get_effective_bdx_coverage_ratio());
    expect(bdxEfCr).to.be.lt(1, "bdxEfCr should be < 1"); // test validation

    await provideBdEu(hre, testUser.address, to_d18(1000)); // treasury gives some bdeu to user, so user can redeem

    const bdEuBdxBalanceBefore_d18 = await bdx.balanceOf(bdEu.address);
    const userBdxBalanceBefore_d18 = await bdx.balanceOf(testUser.address);

    //act
    const bdEuToRedeem = 100;
    const bdEuToRedeem_d18 = to_d18(bdEuToRedeem);
    await bdEu.connect(testUser).approve(bdEuPool.address, bdEuToRedeem_d18);
    await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 1);
    await bdEuPool.connect(testUser).collectRedemption(false);

    const bdEuBdxBalanceAfter_d18 = await bdx.balanceOf(bdEu.address);
    const userBdxBalanceAfter_d18 = await bdx.balanceOf(testUser.address);

    const bdxPrice = d12_ToNumber(await bdEu.BDX_price_d12());

    console.log("bdxEfCr: " + bdxEfCr);
    console.log("bdEuBdxBalanceBefore_d18: " + bdEuBdxBalanceBefore_d18);
    console.log("bdEuBdxBalanceAfter_d18: " + bdEuBdxBalanceAfter_d18);
    console.log("bdxPrice: " + bdxPrice);

    const expectedBdxDiffInBdEu = (bdEuToRedeem * (1 - cr) * bdxEfCr) / bdxPrice;
    console.log("expectedBdxDiffInBdEu: " + expectedBdxDiffInBdEu);

    const actualBdxDiffInBdEu = d18_ToNumber(bdEuBdxBalanceAfter_d18.sub(bdEuBdxBalanceBefore_d18));
    console.log("actualBdxDiffInBdEu: " + actualBdxDiffInBdEu);

    const actualBdxDiffInUser = d18_ToNumber(userBdxBalanceAfter_d18.sub(userBdxBalanceBefore_d18));
    console.log("actualBdxDiffInUser: " + actualBdxDiffInUser);

    expect(actualBdxDiffInBdEu).to.be.closeTo(-expectedBdxDiffInBdEu, 1e-3, "invalid bdx diff in bdEu");
    expect(actualBdxDiffInUser).to.be.closeTo(expectedBdxDiffInBdEu, 1e-3, "invalid bdx diff in user");
  });
});
