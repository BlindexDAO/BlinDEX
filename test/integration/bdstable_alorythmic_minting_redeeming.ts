import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { d12_ToNumber, diffPct, to_d12 } from "../../utils/NumbersHelpers";
import { to_d18, d18_ToNumber } from "../../utils/NumbersHelpers";
import type { SignerWithAddress } from "hardhat-deploy-ethers/signers";
import { getBdEu, getBdx, getWeth, getBdEuWethPool, getUser1, getDeployer } from "../../utils/DeployedContractsHelpers";
import { lockBdeuCrAt } from "../helpers/bdStable";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import { provideBdEu, provideBdx } from "../helpers/common";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function performAlgorithmicMinting(testUser: SignerWithAddress, bdxAmount: number) {
  const bdx = await getBdx(hre);
  const bdEuPool = await getBdEuWethPool(hre);

  await bdx.connect(testUser).approve(bdEuPool.address, to_d18(bdxAmount));
  await bdEuPool.connect(testUser).mintFractionalBdStable(0, to_d18(bdxAmount), to_d18(1), false);
}

describe("BDStable algorythmic", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();
    await setUpFunctionalSystemForTests(hre, 1);
  });

  it("should mint bdeu when CR = 0", async () => {
    const testUser = await getUser1(hre);

    const bdx = await getBdx(hre);
    const weth = await getWeth(hre);
    const bdEu = await getBdEu(hre);

    await provideBdx(hre, testUser.address, to_d18(1000)); // treasury gives some bdx to user, so user can mint
    const bdxBalanceBeforeMinting = await bdx.balanceOf(testUser.address);

    await lockBdeuCrAt(hre, 0);

    const wethBalanceBeforeMinting = await weth.balanceOf(testUser.address);
    const bdEulBalanceBeforeMinting = await bdEu.balanceOf(testUser.address);
    const bdEuBdxBalanceBefore_d18 = await bdx.balanceOf(bdEu.address);

    const bdxInEurPrice = await bdEu.BDX_price_d12();

    const bdxAmountForMintigBdEu = 10;

    await performAlgorithmicMinting(testUser, bdxAmountForMintigBdEu);

    const expectedBdxCost = to_d18(bdxAmountForMintigBdEu);
    const expectedBdEuDiff = to_d18(bdxAmountForMintigBdEu)
      .mul(bdxInEurPrice)
      .div(1e12)
      .mul(to_d12(1 - 0.003))
      .div(1e12); // decrease by minting fee;

    const bdEuBalanceAfterMinting = await bdEu.balanceOf(testUser.address);
    const bdEuBdxBalanceAfter_d18 = await bdx.balanceOf(bdEu.address);

    const diffPctBdEu = diffPct(bdEuBalanceAfterMinting.sub(bdEulBalanceBeforeMinting), expectedBdEuDiff);

    const bdxBalanceAfterMinting = await bdx.balanceOf(testUser.address);
    const actualBdxCost = bdxBalanceBeforeMinting.sub(bdxBalanceAfterMinting);
    const actualBdxIntoBdEu = bdEuBdxBalanceAfter_d18.sub(bdEuBdxBalanceBefore_d18);

    const diffPctBdxCost = diffPct(actualBdxCost, expectedBdxCost);
    const diffPctBdEuBdxBalance = diffPct(actualBdxIntoBdEu, expectedBdxCost);

    const actualWeth = await weth.balanceOf(testUser.address);
    const diffPctWethBalance = diffPct(wethBalanceBeforeMinting, actualWeth);

    console.log(`Diff BDX cost: ${diffPctBdxCost}%`);
    console.log(`Diff Weth balance: ${diffPctWethBalance}%`);
    console.log(`Diff BdEu balance: ${diffPctBdEu}%`);
    console.log(`Diff BdEu BDX balance: ${diffPctBdEuBdxBalance}%`);

    expect(diffPctBdxCost).to.be.closeTo(0, 0.001, "invalid bdx diff");
    expect(diffPctWethBalance).to.be.closeTo(0, 0.001, "invalid weth diff");
    expect(diffPctBdEu).to.be.closeTo(0, 0.001, "invalid bdEu diff");
    expect(diffPctBdEuBdxBalance).to.be.closeTo(0, 0.001, "invalid bdEu bdx diff");
  });

  it("should redeem bdeu when CR = 0", async () => {
    const testUser = await getUser1(hre);

    const bdx = await getBdx(hre);
    const weth = await getWeth(hre);
    const bdEu = await getBdEu(hre);
    const bdEuPool = await getBdEuWethPool(hre);

    await lockBdeuCrAt(hre, 0);

    await provideBdEu(hre, testUser.address, to_d18(1000)); // treasury gives some bdeu to user, so user can redeem

    const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(testUser.address);
    const bdxBalanceBeforeRedeem_d18 = await bdx.balanceOf(testUser.address);
    const wethBalanceBeforeRedeem_d18 = await weth.balanceOf(testUser.address);

    const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
    console.log("bdxInEurPrice           : " + d12_ToNumber(bdxInEurPrice_d12));
    console.log("bdEuBalanceBeforeRedeem: " + d18_ToNumber(bdEuBalanceBeforeRedeem_d18));

    const bdEuToRedeem_d18 = to_d18(100);

    const expectedBdxDelta = d18_ToNumber(bdEuToRedeem_d18.mul(1e12).div(bdxInEurPrice_d12));
    const expectedBdEuDelta = d18_ToNumber(bdEuToRedeem_d18);

    await bdEu.connect(testUser).approve(bdEuPool.address, bdEuToRedeem_d18);

    console.log("edBDX cov: " + (await bdEu.get_effective_bdx_coverage_ratio()));

    await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 0);
    await bdEuPool.connect(testUser).collectRedemption(false);

    const bdEuBalanceAfterRedeem_d18 = await bdEu.balanceOf(testUser.address);
    const bdxBalanceAfterRedeem_d18 = await bdx.balanceOf(testUser.address);
    const wethBalanceAfterRedeem_d18 = await weth.balanceOf(testUser.address);

    console.log("bdEu balance before redeem: " + d18_ToNumber(bdEuBalanceBeforeRedeem_d18));
    console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem_d18));

    console.log("weth balance before redeem:  " + d18_ToNumber(wethBalanceBeforeRedeem_d18));
    console.log("weth balance after redeem:   " + d18_ToNumber(wethBalanceAfterRedeem_d18));

    const wethDelta = d18_ToNumber(wethBalanceAfterRedeem_d18.sub(wethBalanceBeforeRedeem_d18));
    console.log("weth balance delta: " + wethDelta);

    const bdxDelta = d18_ToNumber(bdxBalanceAfterRedeem_d18.sub(bdxBalanceBeforeRedeem_d18));
    console.log("bdx balance delta:          " + bdxDelta);
    console.log("expected bdx balance delta: " + expectedBdxDelta);

    const bdEuDelta = d18_ToNumber(bdEuBalanceBeforeRedeem_d18.sub(bdEuBalanceAfterRedeem_d18));
    console.log("bdEu balance delta:          " + bdEuDelta);
    console.log("expected bdEu balance delta: " + expectedBdEuDelta);

    expect(wethDelta).to.eq(0);
    expect(bdxDelta).to.be.closeTo(expectedBdxDelta, 0.35, "Invalid BDX delta");
    expect(bdEuDelta).to.be.closeTo(expectedBdEuDelta, 0.1, "Invalid BdEu delta");
  });

  it("should fail illegal algorithmic redemption", async () => {
    const testUser = await getUser1(hre);

    const bdEu = await getBdEu(hre);
    const bdEuPool = await getBdEuWethPool(hre);

    await lockBdeuCrAt(hre, 0);

    const bdxAmount = 10;
    await provideBdx(hre, testUser.address, to_d18(bdxAmount * 100)); // treasury gives some bdx to user, so user can mint

    // setup bdEu so it's illegal to redeem for testUser
    await performAlgorithmicMinting(testUser, bdxAmount);
    await bdEu.setMinimumSwapsDelayInBlocks(100);
    // setup finished

    const bdEuBalanceBeforeRedeem_d18 = await bdEu.balanceOf(testUser.address);

    const bdxInEurPrice_d12 = await bdEu.BDX_price_d12();
    console.log("bdxInEurPrice           : " + bdxInEurPrice_d12);
    console.log("bdEuBalanceBeforeRedeem: " + bdEuBalanceBeforeRedeem_d18);

    const bdEuToRedeem_d18 = to_d18(100);

    await bdEu.connect(testUser).approve(bdEuPool.address, bdEuToRedeem_d18);

    await expect(bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 0)).to.be.revertedWith("Cannot legally redeem");
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

    // enable alogirthimc redeem
    const cr = 0;
    await lockBdeuCrAt(hre, cr);

    const bdxEfCr = d12_ToNumber(await bdEu.get_effective_bdx_coverage_ratio());
    expect(bdxEfCr).to.be.lt(1, "bdxEfCr should be < 1"); // test validation

    await provideBdEu(hre, testUser.address, to_d18(100)); // treasury gives some bdeu to user, so user can redeem

    const bdEuBdxBalanceBefore_d18 = await bdx.balanceOf(bdEu.address);
    const userBdxBalanceBefore_d18 = await bdx.balanceOf(testUser.address);

    //act
    const bdEuToRedeem = 100;
    const bdEuToRedeem_d18 = to_d18(bdEuToRedeem);
    await bdEu.connect(testUser).approve(bdEuPool.address, bdEuToRedeem_d18);
    await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem_d18, 1, 0);
    await bdEuPool.connect(testUser).collectRedemption(false);

    const bdEuBdxBalanceAfter_d18 = await bdx.balanceOf(bdEu.address);
    const userBdxBalanceAfter_d18 = await bdx.balanceOf(testUser.address);

    const bdxPrice = d12_ToNumber(await bdEu.BDX_price_d12());

    console.log("bdxEfCr: " + bdxEfCr);
    console.log("bdEuBdxBalanceBefore_d18: " + bdEuBdxBalanceBefore_d18);
    console.log("bdEuBdxBalanceAfter_d18: " + bdEuBdxBalanceAfter_d18);
    console.log("bdxPrice: " + bdxPrice);

    const expectedBdxDiffInBdEu = (bdEuToRedeem * bdxEfCr) / bdxPrice;
    console.log("expectedBdxDiffInBdEu: " + expectedBdxDiffInBdEu);

    const actualBdxDiffInBdEu = d18_ToNumber(bdEuBdxBalanceAfter_d18.sub(bdEuBdxBalanceBefore_d18));
    console.log("actualBdxDiffInBdEu: " + actualBdxDiffInBdEu);

    const actualBdxDiffInUser = d18_ToNumber(userBdxBalanceAfter_d18.sub(userBdxBalanceBefore_d18));
    console.log("actualBdxDiffInUser: " + actualBdxDiffInUser);

    expect(actualBdxDiffInBdEu).to.be.closeTo(-expectedBdxDiffInBdEu, 1e-3, "invalid bdx diff in bdEu");
    expect(actualBdxDiffInUser).to.be.closeTo(expectedBdxDiffInBdEu, 1e-3, "invalid bdx diff in user");
  });
});
