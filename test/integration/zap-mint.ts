import { BdStablePool } from "./../../typechain/BdStablePool";
import { BDStable } from "./../../typechain/BDStable";
import { EXTERNAL_USD_STABLE, PriceFeedContractNames } from "./../../utils/Constants";
import { BigNumber } from "ethers";
import hre from "hardhat";
import { ZapMint, ZapMintParametersStruct } from "./../../typechain/ZapMint";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import {
  formatAddress,
  getBdEu,
  getBDStableWethPool,
  getBdUs,
  getBdx,
  getDeployer,
  getERC20,
  getTreasurySigner,
  getUniswapRouter,
  getUser1,
  getWbtc,
  getWeth
} from "../../utils/DeployedContractsHelpers";
import { diffPct, numberToBigNumberFixed, to_d12 } from "../../utils/NumbersHelpers";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import { getAllTokensAddresses } from "../../utils/UniswapPoolsHelpers";
import { expectToFail } from "../helpers/common";
import { lockBdusCrAt } from "../helpers/bdStable";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getTestBestRoute } from "../helpers/bestRoute";
import { IPriceFeed } from "../../typechain";

const slippage = 0.02;
const slippagePct = slippage * 100;

function valueToSlippedValue(input: BigNumber) {
  const one_d12 = to_d12(1);
  const slippage_d12 = to_d12(slippage);
  const multiplier_d12 = one_d12.sub(slippage_d12);
  return input.mul(multiplier_d12).div(1e12);
}

export async function getBestRouteWithExpectedAmounts(
  hre: HardhatRuntimeEnvironment,
  amount: BigNumber,
  tokenIn: string,
  tokenInPrice: BigNumber,
  collateralRatio: number,
  bdStablePool: BdStablePool
) {
  let amountForCollateral: BigNumber = BigNumber.from(0);
  let amountForBdx: BigNumber = BigNumber.from(0);
  let collateralExpectedSwapAmount: BigNumber = BigNumber.from(0);
  let collateralSwapMinAmountOut: BigNumber = BigNumber.from(0);
  let bdxExpectedSwapAmount: BigNumber = BigNumber.from(0);
  let bdxSwapMinAmountOut: BigNumber = BigNumber.from(0);
  let mintExpectedAmount: BigNumber = BigNumber.from(0);
  let mintMinAmountOut: BigNumber = BigNumber.from(0);
  let collateralBestRoute: string[] = [];
  let bdxBestRoute: string[] = [];

  const collateralRatio_d12 = to_d12(collateralRatio);
  const collateralValue = amount.mul(tokenInPrice).div(1e12).mul(collateralRatio_d12).div(1e12);
  const bdxValue = amount.mul(tokenInPrice).div(1e12).sub(collateralValue);

  const tokenValue = amount.mul(tokenInPrice);
  const bdxPart = bdxValue.add(tokenValue.div(1e12).sub(collateralValue.add(bdxValue)));

  amountForCollateral = amount.sub(bdxPart);
  amountForBdx = bdxPart;

  if (collateralRatio !== 0) {
    const collateralAddress = await bdStablePool.collateral_token();
    const collateralBestRouteWithAmounts = await getTestBestRoute(hre, amountForCollateral, false, tokenIn, collateralAddress);
    collateralBestRoute = collateralBestRouteWithAmounts.route;
    collateralExpectedSwapAmount = collateralBestRouteWithAmounts.finalAmount;
    collateralSwapMinAmountOut = valueToSlippedValue(collateralExpectedSwapAmount);
  }

  if (collateralRatio !== 1) {
    const bdxAddress = (await getBdx(hre)).address;
    const bdxBestRouteWithAmounts = await getTestBestRoute(hre, amountForBdx, false, tokenIn, bdxAddress);
    bdxBestRoute = bdxBestRouteWithAmounts.route;
    bdxExpectedSwapAmount = bdxBestRouteWithAmounts.finalAmount;
    bdxSwapMinAmountOut = valueToSlippedValue(bdxExpectedSwapAmount);
  }

  if (collateralRatio !== 0) {
    const collateralTokenAddress = await bdStablePool.collateral_token();
    const collateralTokenDecimals = await (await getERC20(hre, collateralTokenAddress)).decimals();
    const bdstableTokenAddress = await bdStablePool.BDSTABLE();
    const bdstableTokenDecimals = await (await getERC20(hre, bdstableTokenAddress)).decimals();
    const collateralStableDecimalsPowerDifference = Number(bdstableTokenDecimals) - Number(collateralTokenDecimals);
    const collateralStablePrice_d12 = await bdStablePool.getCollateralPrice_d12();
    const collateralStableDecimalsDifferenceBigNumber = BigNumber.from(10).pow(collateralStableDecimalsPowerDifference);
    mintExpectedAmount = collateralExpectedSwapAmount.mul(collateralStablePrice_d12).div(to_d12(1)).mul(collateralStableDecimalsDifferenceBigNumber);
    mintMinAmountOut = collateralSwapMinAmountOut.mul(collateralStablePrice_d12).div(to_d12(1)).mul(collateralStableDecimalsDifferenceBigNumber);
  }

  if (collateralRatio !== 1) {
    const bdxAddress = (await getBdx(hre)).address;
    const bdxTokenDecimals = await (await getERC20(hre, bdxAddress)).decimals();
    const bdstableTokenAddress = await bdStablePool.BDSTABLE();
    const bdstableTokenDecimals = await (await getERC20(hre, bdstableTokenAddress)).decimals();
    const bdxStableDecimalsPowerDifference = Number(bdstableTokenDecimals) - Number(bdxTokenDecimals);
    const stable = (await hre.ethers.getContractAt("BDStable", formatAddress(hre, bdstableTokenAddress))) as BDStable;
    const bdxStablePrice_d12 = await stable.BDX_price_d12();
    const bdxStableDecimalsDifferenceBigNumber = BigNumber.from(10).pow(bdxStableDecimalsPowerDifference);
    const bdxAmountInBdStable = bdxExpectedSwapAmount.mul(bdxStablePrice_d12).div(to_d12(1)).mul(bdxStableDecimalsDifferenceBigNumber);
    mintExpectedAmount = mintExpectedAmount.add(bdxAmountInBdStable);
    const bdxMinAmountInBdStable = bdxSwapMinAmountOut.mul(bdxStablePrice_d12).div(to_d12(1)).mul(bdxStableDecimalsDifferenceBigNumber);
    mintMinAmountOut = mintMinAmountOut.add(bdxMinAmountInBdStable);
  }

  const mintingFee_d12 = await bdStablePool.minting_fee();
  const priceAfterMintingFeeBase = to_d12(1).sub(mintingFee_d12);
  mintExpectedAmount = mintExpectedAmount.mul(priceAfterMintingFeeBase).div(1e12);
  mintMinAmountOut = valueToSlippedValue(mintMinAmountOut.mul(priceAfterMintingFeeBase).div(1e12));

  return {
    collateralBestRoute: collateralBestRoute,
    bdxBestRoute: bdxBestRoute,
    collateralExpectedSwapAmount: collateralExpectedSwapAmount,
    bdxExpectedSwapAmount: bdxExpectedSwapAmount,
    mintExpectedAmount: mintExpectedAmount,
    collateralSwapMinAmountOut: collateralSwapMinAmountOut,
    bdxSwapMinAmountOut: bdxSwapMinAmountOut,
    mintMinAmountOut: mintMinAmountOut
  };
}

async function initialize() {
  await hre.deployments.fixture();
  const user = await getUser1(hre);
  await setUpFunctionalSystemForTests(hre, 1);
  const treasury = await getTreasurySigner(hre);
  const weth = await getWeth(hre);
  const wbtc = await getWbtc(hre);
  const allInputTokens = await getAllTokensAddresses(hre, [weth.address, wbtc.address]);
  for (const token of allInputTokens) {
    const erc20 = await getERC20(hre, token);
    const decimals = await erc20.decimals();
    erc20.connect(treasury).transfer(user.address, numberToBigNumberFixed(10, decimals));
  }
}

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Zap mint", () => {
  beforeEach(async () => {
    await initialize();
  });

  it("Should mint supported path when CR = 100%", async () => {
    const collateralRatio = 1;
    await lockBdusCrAt(hre, collateralRatio);
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = EXTERNAL_USD_STABLE[hre.network.name];
    const router = await getUniswapRouter(hre);
    const decimals = swapFrom.decimals;
    const amountIn = numberToBigNumberFixed(0.001, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdeuPool = await getBDStableWethPool(hre, "BDEU");
    const stableExpectedFromMint = await getBdEu(hre);

    const feed = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD)) as IPriceFeed;
    const tokenInStablePrice = await feed.price();
    const tokenPriceDecimals = await feed.decimals();
    const tokenInStablePrice_d12 = tokenInStablePrice.mul(BigNumber.from(10 ** (12 - tokenPriceDecimals)));
    const bestRoutesWithExpectedAmounts = await getBestRouteWithExpectedAmounts(
      hre,
      amountIn,
      swapFrom.address,
      tokenInStablePrice_d12,
      collateralRatio,
      wethBdeuPool
    );
    await zapMintTestContract.addTokenSupport(swapFrom.address);

    const tokenIn = await getERC20(hre, swapFrom.address);
    await tokenIn.connect(user).approve(zapMintTestContract.address, amountIn);

    const userStableBalanceBeforeMint = await stableExpectedFromMint.balanceOf(user.address);

    const parameters = {
      mintAmountOutMin: bestRoutesWithExpectedAmounts.mintMinAmountOut,
      collateralSwapAmountOutMin: bestRoutesWithExpectedAmounts.collateralSwapMinAmountOut,
      bdxSwapAmountOutMin: bestRoutesWithExpectedAmounts.bdxSwapMinAmountOut,
      bdstableToMintAddress: stableExpectedFromMint.address,
      bdstablePoolAddress: wethBdeuPool.address,
      collateralSwapPath: bestRoutesWithExpectedAmounts.collateralBestRoute,
      bdxSwapPath: bestRoutesWithExpectedAmounts.bdxBestRoute,
      amountIn: amountIn,
      tokenInStablePrice: tokenInStablePrice_d12,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    await zapMintTestContract.connect(user).zapMint(parameters);

    const userStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(user.address);
    const actualStableDiff = userStableBalanceAfterMint.sub(userStableBalanceBeforeMint);
    const expectedMintAmount = bestRoutesWithExpectedAmounts.mintExpectedAmount;
    const difference = diffPct(actualStableDiff, expectedMintAmount);
    expect(difference).to.be.closeTo(0, slippagePct, "Zap mint did not mint enough tokens");
  });

  it("Should not mint when zap mint is paused", async () => {
    const collateralRatio = 1;
    await lockBdusCrAt(hre, collateralRatio);
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    await zapMintTestContract.connect(deployer).pause();
    const swapFrom = await getBdEu(hre);
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    const bdus = await getBdUs(hre);

    const feed = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD)) as IPriceFeed;
    const tokenInStablePrice = await feed.price();
    const tokenPriceDecimals = await feed.decimals();
    const tokenInStablePrice_d12 = tokenInStablePrice.mul(BigNumber.from(10 ** (12 - tokenPriceDecimals)));
    const bestRoutesWithExpectedAmounts = await getBestRouteWithExpectedAmounts(
      hre,
      amountIn,
      swapFrom.address,
      tokenInStablePrice_d12,
      collateralRatio,
      wethBdusPool
    );

    const tokenIn = await getERC20(hre, swapFrom.address);
    await tokenIn.connect(user).approve(zapMintTestContract.address, amountIn);

    const parameters = {
      mintAmountOutMin: bestRoutesWithExpectedAmounts.mintExpectedAmount,
      collateralSwapAmountOutMin: bestRoutesWithExpectedAmounts.collateralExpectedSwapAmount,
      bdxSwapAmountOutMin: bestRoutesWithExpectedAmounts.bdxExpectedSwapAmount,
      bdstableToMintAddress: bdus.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: bestRoutesWithExpectedAmounts.collateralBestRoute,
      bdxSwapPath: bestRoutesWithExpectedAmounts.bdxBestRoute,
      amountIn: amountIn,
      tokenInStablePrice: tokenInStablePrice_d12,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    const mintPromise = zapMintTestContract.connect(user).zapMint(parameters);
    await expectToFail(() => mintPromise, "Pausable: paused");
  });

  it("Should not mint not supported token", async () => {
    const collateralRatio = 1;
    await lockBdusCrAt(hre, collateralRatio);
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    const bdus = await getBdUs(hre);
    const feed = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD)) as IPriceFeed;
    const tokenInStablePrice = await feed.price();
    const tokenPriceDecimals = await feed.decimals();
    const tokenInStablePrice_d12 = tokenInStablePrice.mul(BigNumber.from(10 ** (12 - tokenPriceDecimals)));

    const bestRoutesWithExpectedAmounts = await getBestRouteWithExpectedAmounts(
      hre,
      amountIn,
      swapFrom.address,
      tokenInStablePrice_d12,
      collateralRatio,
      wethBdusPool
    );

    const tokenIn = await getERC20(hre, swapFrom.address);
    await tokenIn.connect(user).approve(zapMintTestContract.address, amountIn);

    const parameters = {
      mintAmountOutMin: bestRoutesWithExpectedAmounts.mintExpectedAmount,
      collateralSwapAmountOutMin: bestRoutesWithExpectedAmounts.collateralExpectedSwapAmount,
      bdxSwapAmountOutMin: bestRoutesWithExpectedAmounts.bdxExpectedSwapAmount,
      bdstableToMintAddress: bdus.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: bestRoutesWithExpectedAmounts.collateralBestRoute,
      bdxSwapPath: bestRoutesWithExpectedAmounts.bdxBestRoute,
      amountIn: amountIn,
      tokenInStablePrice: tokenInStablePrice_d12,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    const mintPromise = zapMintTestContract.connect(user).zapMint(parameters);
    await expectToFail(() => mintPromise, "ZapMint: Collateral path token is not supported for zap minting");
  });

  it("Should not zap mint after token support was removed", async () => {
    const collateralRatio = 1;
    await lockBdusCrAt(hre, collateralRatio);
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(0.001, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    const stableExpectedFromMint = await getBdUs(hre);
    const feed = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD)) as IPriceFeed;
    const tokenInStablePrice = await feed.price();
    const tokenPriceDecimals = await feed.decimals();
    const tokenInStablePrice_d12 = tokenInStablePrice.mul(BigNumber.from(10 ** (12 - tokenPriceDecimals)));

    const bestRoutesWithExpectedAmounts = await getBestRouteWithExpectedAmounts(
      hre,
      amountIn,
      swapFrom.address,
      tokenInStablePrice_d12,
      collateralRatio,
      wethBdusPool
    );

    await zapMintTestContract.addTokenSupport(swapFrom.address);
    await zapMintTestContract.removeTokenSupport(swapFrom.address);

    await swapFrom.connect(user).approve(zapMintTestContract.address, amountIn);

    const parameters = {
      mintAmountOutMin: bestRoutesWithExpectedAmounts.mintExpectedAmount,
      collateralSwapAmountOutMin: bestRoutesWithExpectedAmounts.collateralExpectedSwapAmount,
      bdxSwapAmountOutMin: bestRoutesWithExpectedAmounts.bdxExpectedSwapAmount,
      bdstableToMintAddress: stableExpectedFromMint.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: bestRoutesWithExpectedAmounts.collateralBestRoute,
      bdxSwapPath: bestRoutesWithExpectedAmounts.bdxBestRoute,
      amountIn: amountIn,
      tokenInStablePrice: tokenInStablePrice_d12,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    const mintPromise = zapMintTestContract.connect(user).zapMint(parameters);
    await expectToFail(() => mintPromise, "ZapMint: Collateral path token is not supported for zap minting");
  });

  it("Should mint supported token when 0% < collateral ratio < 100%", async () => {
    const collateralRatio = 0.7;
    await lockBdusCrAt(hre, collateralRatio);

    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(0.001, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    await zapMintTestContract.addTokenSupport(swapFrom.address);

    const stableExpectedFromMint = await getBdUs(hre);

    const feed = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD)) as IPriceFeed;
    const tokenInStablePrice = await feed.price();
    const tokenPriceDecimals = await feed.decimals();
    const tokenInStablePrice_d12 = tokenInStablePrice.mul(BigNumber.from(10 ** (12 - tokenPriceDecimals)));

    const bestRoutesWithExpectedAmounts = await getBestRouteWithExpectedAmounts(
      hre,
      amountIn,
      swapFrom.address,
      tokenInStablePrice_d12,
      collateralRatio,
      wethBdusPool
    );

    await swapFrom.connect(user).approve(zapMintTestContract.address, amountIn);

    const bdeuBalanceBeforeMinting_d18 = await swapFrom.balanceOf(user.address);
    const bdusBalanceBeforeMinting_d18 = await stableExpectedFromMint.balanceOf(user.address);

    const parameters = {
      mintAmountOutMin: bestRoutesWithExpectedAmounts.mintMinAmountOut,
      collateralSwapAmountOutMin: bestRoutesWithExpectedAmounts.collateralSwapMinAmountOut,
      bdxSwapAmountOutMin: bestRoutesWithExpectedAmounts.bdxSwapMinAmountOut,
      bdstableToMintAddress: stableExpectedFromMint.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: bestRoutesWithExpectedAmounts.collateralBestRoute,
      bdxSwapPath: bestRoutesWithExpectedAmounts.bdxBestRoute,
      amountIn: amountIn,
      tokenInStablePrice: tokenInStablePrice_d12,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    await zapMintTestContract.connect(user).zapMint(parameters);

    const bdeuBalanceAfterMinting_d18 = await swapFrom.balanceOf(user.address);
    const bdusBalanceAfterMinting_d18 = await stableExpectedFromMint.balanceOf(user.address);

    const tokenInExpectedDiff = bdeuBalanceBeforeMinting_d18.sub(amountIn);
    const tokenOutExpectedDiff = bdusBalanceAfterMinting_d18.sub(bdusBalanceBeforeMinting_d18);

    const tokenInDifferencePct = diffPct(bdeuBalanceAfterMinting_d18, tokenInExpectedDiff);
    const tokenOutDifferencePct = diffPct(tokenOutExpectedDiff, bestRoutesWithExpectedAmounts.mintExpectedAmount);

    expect(tokenInDifferencePct).to.be.closeTo(0, 0.001, "User have spent more than amountIn input token");

    expect(tokenOutDifferencePct).to.be.closeTo(0, slippagePct, "Zap mint did not mint enough tokens");
  });

  it("Should not swap supported token to collateral when swap result does not satisfy minAmountOut", async () => {
    const collateralRatio = 1;
    await lockBdusCrAt(hre, collateralRatio);

    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    await zapMintTestContract.addTokenSupport(swapFrom.address);

    await swapFrom.connect(user).approve(zapMintTestContract.address, amountIn);
    const stableExpectedFromMint = await getBdUs(hre);

    const feed = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD)) as IPriceFeed;
    const tokenInStablePrice = await feed.price();
    const tokenPriceDecimals = await feed.decimals();
    const tokenInStablePrice_d12 = tokenInStablePrice.mul(BigNumber.from(10 ** (12 - tokenPriceDecimals)));
    const bestRoutesWithExpectedAmounts = await getBestRouteWithExpectedAmounts(
      hre,
      amountIn,
      swapFrom.address,
      tokenInStablePrice_d12,
      collateralRatio,
      wethBdusPool
    );

    const parameters = {
      mintAmountOutMin: bestRoutesWithExpectedAmounts.mintMinAmountOut,
      collateralSwapAmountOutMin: bestRoutesWithExpectedAmounts.collateralSwapMinAmountOut.mul(BigNumber.from(2)),
      bdxSwapAmountOutMin: bestRoutesWithExpectedAmounts.bdxSwapMinAmountOut,
      bdstableToMintAddress: stableExpectedFromMint.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: bestRoutesWithExpectedAmounts.collateralBestRoute,
      bdxSwapPath: bestRoutesWithExpectedAmounts.bdxBestRoute,
      amountIn: amountIn,
      tokenInStablePrice: tokenInStablePrice_d12,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    const mintPromise = zapMintTestContract.connect(user).zapMint(parameters);

    await expectToFail(() => mintPromise, "ZapMint: UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
  });

  it("Should not swap supported token to bdx when swap result does not satisfy minAmountOut", async () => {
    const collateralRatio = 0.5;
    await lockBdusCrAt(hre, collateralRatio);

    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    await zapMintTestContract.addTokenSupport(swapFrom.address);

    await swapFrom.connect(user).approve(zapMintTestContract.address, amountIn);
    const stableExpectedFromMint = await getBdUs(hre);

    const feed = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD)) as IPriceFeed;
    const tokenInStablePrice = await feed.price();
    const tokenPriceDecimals = await feed.decimals();
    const tokenInStablePrice_d12 = tokenInStablePrice.mul(BigNumber.from(10 ** (12 - tokenPriceDecimals)));
    const bestRoutesWithExpectedAmounts = await getBestRouteWithExpectedAmounts(
      hre,
      amountIn,
      swapFrom.address,
      tokenInStablePrice_d12,
      collateralRatio,
      wethBdusPool
    );

    const parameters = {
      mintAmountOutMin: bestRoutesWithExpectedAmounts.mintMinAmountOut,
      collateralSwapAmountOutMin: bestRoutesWithExpectedAmounts.collateralSwapMinAmountOut,
      bdxSwapAmountOutMin: bestRoutesWithExpectedAmounts.bdxSwapMinAmountOut.mul(BigNumber.from(2)),
      bdstableToMintAddress: stableExpectedFromMint.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: bestRoutesWithExpectedAmounts.collateralBestRoute,
      bdxSwapPath: bestRoutesWithExpectedAmounts.bdxBestRoute,
      amountIn: amountIn,
      tokenInStablePrice: tokenInStablePrice_d12,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    const mintPromise = zapMintTestContract.connect(user).zapMint(parameters);

    await expectToFail(() => mintPromise, "ZapMint: UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
  });

  it("Should not zap mint supported token when mint result does not satisfy minAmountOut", async () => {
    const collateralRatio = 1;
    await lockBdusCrAt(hre, collateralRatio);

    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    await zapMintTestContract.addTokenSupport(swapFrom.address);

    await swapFrom.connect(user).approve(zapMintTestContract.address, amountIn);
    const stableExpectedFromMint = await getBdUs(hre);

    const feed = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD)) as IPriceFeed;
    const tokenInStablePrice = await feed.price();
    const tokenPriceDecimals = await feed.decimals();
    const tokenInStablePrice_d12 = tokenInStablePrice.mul(BigNumber.from(10 ** (12 - tokenPriceDecimals)));
    const bestRoutesWithExpectedAmounts = await getBestRouteWithExpectedAmounts(
      hre,
      amountIn,
      swapFrom.address,
      tokenInStablePrice_d12,
      collateralRatio,
      wethBdusPool
    );

    const parameters = {
      mintAmountOutMin: bestRoutesWithExpectedAmounts.mintMinAmountOut.mul(BigNumber.from(2)),
      collateralSwapAmountOutMin: bestRoutesWithExpectedAmounts.collateralSwapMinAmountOut,
      bdxSwapAmountOutMin: bestRoutesWithExpectedAmounts.bdxSwapMinAmountOut,
      bdstableToMintAddress: stableExpectedFromMint.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: bestRoutesWithExpectedAmounts.collateralBestRoute,
      bdxSwapPath: bestRoutesWithExpectedAmounts.bdxBestRoute,
      amountIn: amountIn,
      tokenInStablePrice: tokenInStablePrice_d12,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    const mintPromise = zapMintTestContract.connect(user).zapMint(parameters);

    await expectToFail(() => mintPromise, "ZapMint: Slippage limit reached");
  });
});
