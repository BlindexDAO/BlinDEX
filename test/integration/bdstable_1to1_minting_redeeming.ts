import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { to_d18, d18_ToNumber, d12_ToNumber, diffPct, to_d12, to_d8 } from "../../utils/NumbersHelpers";
import type { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { lockBdeuCrAt } from "../helpers/bdStable";
import {
  getBdEu,
  getBdEuWbtcPool,
  getBdEuWethPool,
  getUser1,
  getOnChainWbtcFiatPrice,
  getOnChainWethFiatPrice,
  getWbtc,
  getWeth,
  mintWbtc,
  mintWeth
} from "../../utils/DeployedContractsHelpers";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import type { HardhatRuntimeEnvironment } from "hardhat/types/runtime";
import { provideBdEu, expectToFail } from "../helpers/common";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BDStable 1to1", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();
    await setUpFunctionalSystemForTests(hre, 0.7);
  });

  it("should mint bdeu when CR = 1 [for WETH]", async () => {
    const bdEu = await getBdEu(hre);
    const bdEuPool = await getBdEuWethPool(hre);
    const mintingFee_d12 = await bdEuPool.minting_fee();
    const weth = await getWeth(hre);

    const ethInEurPrice_1e12 = (await getOnChainWethFiatPrice(hre, "EUR")).price_1e12;

    const testUser = await getUser1(hre);
    const collateralAmount = 10;

    await lockBdeuCrAt(hre, 1);

    const bdEuBefore_d18 = await bdEu.balanceOf(testUser.address);
    const poolWethBefore_d18 = await weth.balanceOf(bdEuPool.address);

    await perform1To1MintingForWeth(hre, testUser, collateralAmount);

    const bdEuAfter_d18 = await bdEu.balanceOf(testUser.address);
    const poolWethAfter_d18 = await weth.balanceOf(bdEuPool.address);

    console.log("ethInEurPrice: " + d12_ToNumber(ethInEurPrice_1e12));

    const expectedBdEuDiff_d18 = ethInEurPrice_1e12.mul(to_d18(collateralAmount)).div(1e12).mul(to_d12(1).sub(mintingFee_d12)).div(1e12);
    const actualBdEuDiff_d18 = bdEuAfter_d18.sub(bdEuBefore_d18);
    const diff = diffPct(actualBdEuDiff_d18, expectedBdEuDiff_d18);

    console.log("BeEur before: " + d18_ToNumber(bdEuBefore_d18));
    console.log("BeEur after : " + d18_ToNumber(bdEuAfter_d18));
    console.log("Expected BeEur: " + d18_ToNumber(expectedBdEuDiff_d18));
    console.log("Actual BeEur  : " + d18_ToNumber(actualBdEuDiff_d18));
    console.log(`Diff BeEur: ${diff}%`);

    expect(diff).to.be.eq(0);
    expect(poolWethAfter_d18.sub(poolWethBefore_d18)).to.be.eq(to_d18(collateralAmount), "invalid pool weth diff");
  });

  it("should mint bdeu when CR = 1 [for WETH] with native token", async () => {
    const bdEu = await getBdEu(hre);
    const bdEuPool = await getBdEuWethPool(hre);
    const mintingFee_d12 = await bdEuPool.minting_fee();
    const weth = await getWeth(hre);

    const ethInEurPrice_1e12 = (await getOnChainWethFiatPrice(hre, "EUR")).price_1e12;

    const testUser = await getUser1(hre);
    const collateralAmount = 10;

    await lockBdeuCrAt(hre, 1);

    const bdEuBefore_d18 = await bdEu.balanceOf(testUser.address);
    const poolWethBefore_d18 = await weth.balanceOf(bdEuPool.address);

    await perform1To1MintingForEth(hre, testUser, collateralAmount);

    const bdEuAfter_d18 = await bdEu.balanceOf(testUser.address);
    const poolWethAfter_d18 = await weth.balanceOf(bdEuPool.address);

    console.log("ethInEurPrice: " + d12_ToNumber(ethInEurPrice_1e12));

    const expectedBdEuDiff_d18 = ethInEurPrice_1e12.mul(to_d18(collateralAmount)).div(1e12).mul(to_d12(1).sub(mintingFee_d12)).div(1e12);
    const actualBdEuDiff_d18 = bdEuAfter_d18.sub(bdEuBefore_d18);
    const diff = diffPct(actualBdEuDiff_d18, expectedBdEuDiff_d18);

    console.log("BeEur before: " + d18_ToNumber(bdEuBefore_d18));
    console.log("BeEur after : " + d18_ToNumber(bdEuAfter_d18));
    console.log("Expected BeEur: " + d18_ToNumber(expectedBdEuDiff_d18));
    console.log("Actual BeEur  : " + d18_ToNumber(actualBdEuDiff_d18));
    console.log(`Diff BeEur: ${diff}%`);

    expect(diff).to.be.eq(0, "invalid bedu diff");
    expect(poolWethAfter_d18.sub(poolWethBefore_d18)).to.be.eq(to_d18(collateralAmount), "invalid pool weth diff");
  });

  it("should mint bdeu when CR = 1 [for WBTC]", async () => {
    const bdEu = await getBdEu(hre);

    const btcInEurPrice_1e12 = (await getOnChainWbtcFiatPrice(hre, "EUR")).price_1e12;

    const testUser = await getUser1(hre);
    const collateralAmount = 0.5;

    await lockBdeuCrAt(hre, 1);

    const bdEuBefore_d18 = await bdEu.balanceOf(testUser.address);

    await perform1To1MintingForWbtc(hre, testUser, collateralAmount);

    const bdEuAfter_d18 = await bdEu.balanceOf(testUser.address);

    console.log("btcInEurPrice: " + d12_ToNumber(btcInEurPrice_1e12));

    const expectedBdEuDiff_d18 = btcInEurPrice_1e12
      .mul(to_d18(collateralAmount))
      .div(1e12)
      .mul(to_d12(1 - 0.003))
      .div(1e12); // decrease by minting fee

    const actualBdEuDiff_d18 = bdEuAfter_d18.sub(bdEuBefore_d18);
    const pctDiff = diffPct(actualBdEuDiff_d18, expectedBdEuDiff_d18);

    console.log("BeEur before: " + d18_ToNumber(bdEuBefore_d18));
    console.log("BeEur after : " + d18_ToNumber(bdEuAfter_d18));
    console.log("Expected BeEur: " + d18_ToNumber(expectedBdEuDiff_d18));
    console.log("Actual   BeEur: " + d18_ToNumber(actualBdEuDiff_d18));
    console.log(`Diff BeEur: ${pctDiff}%`);

    // we need a big tolerance due to price divergence in different sources
    // [eth-btc chainlink * eth-fiat chainlink (in contract)] vs [direct btc-fiat chinlink price (in test)]
    expect(pctDiff).to.be.closeTo(0, 2);
  });

  it("should redeem bdeu when CR = 1", async () => {
    const testUser = await getUser1(hre);

    const weth = await getWeth(hre);
    const bdEuPool = await getBdEuWethPool(hre);

    await lockBdeuCrAt(hre, 1);

    const ethInEurPrice_1e12 = (await getOnChainWethFiatPrice(hre, "EUR")).price_1e12;

    const bdEu = await getBdEu(hre);

    await provideBdEu(hre, testUser.address, to_d18(1000)); // treasury gives some bdeu to user so user can redeem it

    const bdEuBalanceBeforeRedeem = await bdEu.balanceOf(testUser.address);
    const wethBalanceBeforeRedeem = await weth.balanceOf(testUser.address);

    await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem);

    const bdEuToRedeem = to_d18(100);

    const efCr_d12 = await bdEu.effective_global_collateral_ratio_d12();
    expect(d12_ToNumber(efCr_d12)).to.be.lt(1, "effective collateral ratio should be less than 1"); // test validation
    const expectedWethFromRedeem = bdEuToRedeem
      .mul(1e12)
      .div(ethInEurPrice_1e12)
      .mul(efCr_d12)
      .div(1e12)
      .mul(to_d12(1 - 0.003))
      .div(1e12); // decrease by redemption fee

    await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem, 0, 1);
    await bdEuPool.connect(testUser).collectRedemption(false);

    const bdEuBalanceAfterRedeem = await bdEu.balanceOf(testUser.address);
    const wethBalanceAfterRedeem = await weth.balanceOf(testUser.address);

    console.log("bdEu balance before redeem: " + d18_ToNumber(bdEuBalanceBeforeRedeem));
    console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem));

    console.log("weth balance before redeem:  " + d18_ToNumber(wethBalanceBeforeRedeem));
    console.log("weth balance after redeem:   " + d18_ToNumber(wethBalanceAfterRedeem));

    const wethDelta = d18_ToNumber(wethBalanceAfterRedeem.sub(wethBalanceBeforeRedeem));
    console.log("weth balance delta:        " + wethDelta);
    console.log("expected weth from redeem: " + d18_ToNumber(expectedWethFromRedeem));

    const bdEuDelta = d18_ToNumber(bdEuBalanceBeforeRedeem.sub(bdEuBalanceAfterRedeem));
    console.log("bdEu balance delta:    " + bdEuDelta);
    console.log("bd eu to redeem:       " + d18_ToNumber(bdEuToRedeem));

    expect(bdEuBalanceBeforeRedeem).to.be.gt(0);
    expect(bdEuDelta).to.be.closeTo(d18_ToNumber(bdEuToRedeem), 1e-6, "unexpected bdeu delta");
    expect(wethDelta).to.be.closeTo(d18_ToNumber(expectedWethFromRedeem), 1e-6, "unexpected weth delta");
  });

  it("should redeem bdeu when CR = 1 with native token", async () => {
    const testUser = await getUser1(hre);

    const weth = await getWeth(hre);
    const bdEuPool = await getBdEuWethPool(hre);

    await lockBdeuCrAt(hre, 1);

    const ethInEurPrice_1e12 = (await getOnChainWethFiatPrice(hre, "EUR")).price_1e12;

    const bdEu = await getBdEu(hre);

    await provideBdEu(hre, testUser.address, to_d18(1000)); // treasury gives some bdeu to user so user can redeem it

    const bdEuBalanceBeforeRedeem = await bdEu.balanceOf(testUser.address);
    const wethBalanceBeforeRedeem = await weth.balanceOf(testUser.address);
    const poolWethBalanceBeforeRedeem = await weth.balanceOf(bdEuPool.address);

    await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem);

    const bdEuToRedeem = to_d18(100);

    const efCr_d12 = await bdEu.effective_global_collateral_ratio_d12();
    expect(d12_ToNumber(efCr_d12)).to.be.lt(1, "effective collateral ratio should be less than 1"); // test validation
    const expectedWethFromRedeem = 0; // we collect native token ETH
    const expectedWethExtractedFromPool = -d18_ToNumber(
      bdEuToRedeem
        .mul(1e12)
        .div(ethInEurPrice_1e12)
        .mul(efCr_d12)
        .div(1e12)
        .mul(to_d12(1 - 0.003))
        .div(1e12)
    );

    await bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem, 0, 1);
    await bdEuPool.connect(testUser).collectRedemption(true);

    const bdEuBalanceAfterRedeem = await bdEu.balanceOf(testUser.address);
    const wethBalanceAfterRedeem = await weth.balanceOf(testUser.address);
    const poolWethBalanceAfterRedeem = await weth.balanceOf(bdEuPool.address);

    console.log("bdEu balance before redeem: " + d18_ToNumber(bdEuBalanceBeforeRedeem));
    console.log("bdEu balance after redeem:  " + d18_ToNumber(bdEuBalanceAfterRedeem));

    console.log("weth balance before redeem:  " + d18_ToNumber(wethBalanceBeforeRedeem));
    console.log("weth balance after redeem:   " + d18_ToNumber(wethBalanceAfterRedeem));

    const wethDelta = d18_ToNumber(wethBalanceAfterRedeem.sub(wethBalanceBeforeRedeem));
    console.log("weth balance delta:        " + wethDelta);
    console.log("expected weth from redeem: " + expectedWethFromRedeem);

    const poolWethDelta = d18_ToNumber(poolWethBalanceAfterRedeem.sub(poolWethBalanceBeforeRedeem));
    console.log("weth pool balance delta:        " + poolWethDelta);
    console.log("expected pool weth from redeem: " + expectedWethExtractedFromPool);

    const bdEuDelta = d18_ToNumber(bdEuBalanceBeforeRedeem.sub(bdEuBalanceAfterRedeem));
    console.log("bdEu balance delta:    " + bdEuDelta);
    console.log("bd eu to redeem:       " + d18_ToNumber(bdEuToRedeem));

    expect(bdEuBalanceBeforeRedeem).to.be.gt(0, "invalid bdEuBalanceBeforeRedeem");
    expect(bdEuDelta).to.be.closeTo(d18_ToNumber(bdEuToRedeem), 1e-6, "unexpected bdeu delta");
    expect(wethDelta).to.be.eq(expectedWethFromRedeem, "unexpected weth delta");
    expect(poolWethDelta).to.be.closeTo(expectedWethExtractedFromPool, 1e-6, "unexpected pool weth delta");
  });

  it("should fail illegal 1to1 redemption", async () => {
    const testUser = await getUser1(hre);

    const bdEuPool = await getBdEuWethPool(hre);
    const bdEu = await getBdEu(hre);

    await lockBdeuCrAt(hre, 1);

    const collateralAmount = 0.1;

    // setup bdEu so it's illegal to redeem for testUser
    await perform1To1MintingForWeth(hre, testUser, collateralAmount);
    await bdEu.setMinimumSwapsDelayInBlocks(100);
    // setup finished

    await provideBdEu(hre, testUser.address, to_d18(1000)); // treasury gives some bdeu to user so user can redeem it

    const bdEuBalanceBeforeRedeem = await bdEu.balanceOf(testUser.address);

    await bdEu.connect(testUser).approve(bdEuPool.address, bdEuBalanceBeforeRedeem);

    const bdEuToRedeem = to_d18(100);

    const efCr_d12 = await bdEu.effective_global_collateral_ratio_d12();
    expect(d12_ToNumber(efCr_d12)).to.be.lt(1, "effective collateral ratio should be less than 1"); // test validation

    await expect(bdEuPool.connect(testUser).redeemFractionalBdStable(bdEuToRedeem, 0, 1)).to.be.revertedWith("Cannot legally redeem");
  });

  it("should set right treasury", async () => {
    const bdEu = await getBdEu(hre);
    const testUser = await getUser1(hre);

    await bdEu.setTreasury(testUser.address);
    expect(await bdEu.treasury()).to.be.equal(testUser.address);
  });

  it("set treasury should emit event", async () => {
    const bdEu = await getBdEu(hre);
    const testUser = await getUser1(hre);

    const tx = await bdEu.setTreasury(testUser.address);
    expect(tx).to.emit(bdEu, "TreasuryChanged").withArgs(testUser.address);
  });

  it("should fail if not owner calls setTreasury()", async () => {
    const bdEu = await getBdEu(hre);
    const testUser = await getUser1(hre);

    await expectToFail(() => bdEu.connect(testUser).setTreasury(testUser.address), "Ownable: caller is not the owner");
  });
});

export async function perform1To1MintingForWeth(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, collateralAmount: number) {
  const bdEuPool = await getBdEuWethPool(hre);

  const weth = await getWeth(hre);

  await mintWeth(hre, user, to_d18(1000));
  await weth.connect(user).approve(bdEuPool.address, to_d18(collateralAmount));
  await bdEuPool.connect(user).mintFractionalBdStable(to_d18(collateralAmount), 0, to_d18(1), false);
}

export async function perform1To1MintingForEth(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, collateralAmount: number) {
  const bdEuPool = await getBdEuWethPool(hre);

  await bdEuPool.connect(user).mintFractionalBdStable(to_d18(collateralAmount), 0, to_d18(1), true, { value: to_d18(collateralAmount) });
}

export async function perform1To1MintingForWbtc(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, wbtcAmount: number) {
  const bdEuPool = await getBdEuWbtcPool(hre);
  const wbtc = await getWbtc(hre);

  await mintWbtc(hre, user, to_d8(wbtcAmount));

  await wbtc.connect(user).approve(bdEuPool.address, to_d8(wbtcAmount));
  await bdEuPool.connect(user).mintFractionalBdStable(to_d8(wbtcAmount), 0, to_d18(1), false, {});
}
