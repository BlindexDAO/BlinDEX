import { BdStablePool } from "./../../typechain/BdStablePool";
import { BDStable } from "./../../typechain/BDStable";
import { EXTERNAL_USD_STABLE } from "./../../utils/Constants";
import { BigNumber } from "ethers";
import hre from "hardhat";
import { ZapMint, ZapMintParametersStruct } from "./../../typechain/ZapMint";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import {
  formatAddress,
  getAllBDStablePools,
  getBdEu,
  getBDStableWethPool,
  getBdUs,
  getBdx,
  getDeployer,
  getERC20,
  getOnChainWethFiatPrice,
  getTreasurySigner,
  getUniswapRouter,
  getUser1,
  getWbtc,
  getWeth
} from "../../utils/DeployedContractsHelpers";
import { d18_ToNumber, numberToBigNumberFixed, to_d12, to_d18, to_d8 } from "../../utils/NumbersHelpers";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import { chooseBestPath, generateAllPaths, generatePaths, getAllTokensAddresses } from "../../utils/UniswapPoolsHelpers";
import { expectToFail } from "../helpers/common";
import { lockBdusCrAt } from "../helpers/bdStable";
import { HardhatRuntimeEnvironment } from "hardhat/types";

function valueToSlippedValue(input: BigNumber) {
  const one_d12 = to_d12(1);
  const slippage_d12 = to_d12(0.02);
  const multiplier_d12 = one_d12.sub(slippage_d12);
  return input.mul(multiplier_d12).div(1e12);
}

async function getBestBdxPath(
  hre: HardhatRuntimeEnvironment,
  swapFrom: string,
  amountIn: BigNumber,
  collateralRatio: number,
  stableToMint: string | BDStable,
  bdstablePool: string | BdStablePool
) {
  if (collateralRatio === 1) {
    return [];
  }

  const stable =
    typeof stableToMint === "string" ? ((await hre.ethers.getContractAt("BDStable", formatAddress(hre, stableToMint))) as BDStable) : stableToMint;
  const stablePool =
    typeof bdstablePool === "string"
      ? ((await hre.ethers.getContractAt("BDStablePool", formatAddress(hre, bdstablePool))) as BdStablePool)
      : bdstablePool;
  const bdxInStablePrice_d12 = await stable.BDX_price_d12();
  const collateralInStablePrice_d12 = await stablePool.getCollateralPrice_d12();
  const bdxPriceInCollateral_d12 = BigNumber.from(1e12).mul(collateralInStablePrice_d12).div(bdxInStablePrice_d12);
  const bdxAmountIn = amountIn
    .mul(to_d8(1 - collateralRatio))
    .div(to_d8(collateralRatio))
    .mul(bdxPriceInCollateral_d12)
    .div(1e12);

  const bdx = await getBdx(hre);
  const allPossibleZapMintBdxPaths = await generatePaths(hre, bdxAmountIn, swapFrom, bdx.address);
  const bdxBestPath = await chooseBestPath(allPossibleZapMintBdxPaths);
  return bdxBestPath.path;
}

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe.only("Zap mint", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();
    const deployer = await getDeployer(hre);
    await setUpFunctionalSystemForTests(hre, 1);
    const treasury = await getTreasurySigner(hre);
    const weth = await getWeth(hre);
    const wbtc = await getWbtc(hre);
    const allInputTokens = await getAllTokensAddresses(hre, [weth.address, wbtc.address]);
    for (const token of allInputTokens) {
      const erc20 = await getERC20(hre, token);
      const decimals = await erc20.decimals();
      erc20.connect(treasury).transfer(deployer.address, numberToBigNumberFixed(10, decimals));
    }
  });

  it("Should zap mint for every possible non-singular path", async () => {
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const bdx = await getBdx(hre);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const weth = await getWeth(hre);
    const router = await getUniswapRouter(hre);

    const wbtc = await getWbtc(hre);
    const collateralTokens = [weth.address, wbtc.address];
    const excludedInputTokens = [bdx.address, weth.address, wbtc.address];
    const allPossibleZapMintCollateralPaths = await generateAllPaths(hre, excludedInputTokens, collateralTokens);

    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;

    const allBDStableCollateralPools = await getAllBDStablePools(hre);

    for (const possibleZapMintPath of allPossibleZapMintCollateralPaths) {
      const swapFrom = possibleZapMintPath[0];
      const swapTo = possibleZapMintPath[possibleZapMintPath.length - 1];
      const poolsWithProperCollateral: BdStablePool[] = [];
      for (const pool of allBDStableCollateralPools) {
        const collateralTokenAddress = await pool.collateral_token();
        const stableTokenAddress = await pool.BDSTABLE();
        if (collateralTokenAddress === swapTo && stableTokenAddress !== swapFrom) {
          poolsWithProperCollateral.push(pool);
        }
      }

      for (const poolWithProperCollateral of poolsWithProperCollateral) {
        const stableExpectedFromMintAddress = await poolWithProperCollateral.BDSTABLE();
        const stableExpectedFromMint = await getERC20(hre, stableExpectedFromMintAddress);
        const tokenToApproveAndTranfer = await getERC20(hre, swapFrom);
        const erc20 = await getERC20(hre, swapFrom);
        const decimals = await erc20.decimals();
        const amountIn = numberToBigNumberFixed(0.001, decimals);
        const bdxBestPath = await getBestBdxPath(hre, swapFrom, amountIn, 1, stableExpectedFromMintAddress, poolWithProperCollateral);

        const deployerStableBalanceBeforeMint = await stableExpectedFromMint.balanceOf(deployer.address);
        await tokenToApproveAndTranfer.connect(user).approve(zapMintTestContract.address, amountIn);
        await zapMintTestContract.addTokenSupportForMinting(possibleZapMintPath[0]);

        const parameters = {
          amountOutMin: 0,
          bdstableToMintAddress: stableExpectedFromMintAddress,
          bdstablePoolAddress: poolWithProperCollateral.address,
          collateralSwapPath: possibleZapMintPath,
          bdxSwapPath: bdxBestPath,
          amountIn: amountIn,
          router: router.address,
          deadline: currentBlock.timestamp + 1e5
        } as ZapMintParametersStruct;
        await zapMintTestContract.connect(user).zapMint(parameters);

        const deployerStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(deployer.address);
        const stableDiff = deployerStableBalanceAfterMint.sub(deployerStableBalanceBeforeMint);
        expect(stableDiff).to.be.gt(BigNumber.from(0), "Zap mint did not mint anything");
      }
    }
  });

  it.only("Should mint supported direct path", async () => {
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const collateralPath = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(0.001, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    const stableExpectedFromMint = await getBdUs(hre);
    const bdxPath = await getBestBdxPath(hre, swapFrom.address, amountIn, 1, stableExpectedFromMint, wethBdusPool);
    await zapMintTestContract.addTokenSupportForMinting(swapFrom.address);

    await swapFrom.connect(user).approve(zapMintTestContract.address, amountIn);

    const deployerStableBalanceBeforeMint = await stableExpectedFromMint.balanceOf(deployer.address);

    const parameters = {
      amountOutMin: 0,
      bdstableToMintAddress: stableExpectedFromMint.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: collateralPath,
      bdxSwapPath: bdxPath,
      amountIn: amountIn,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    await zapMintTestContract.connect(user).zapMint(parameters);

    const deployerStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(deployer.address);
    const stableDiff = deployerStableBalanceAfterMint.sub(deployerStableBalanceBeforeMint);
    expect(stableDiff).to.be.gt(BigNumber.from(0), "Zap mint did not mint anything");
  });

  it("Should mint supported non-direct path when CR = 100%", async () => {
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = EXTERNAL_USD_STABLE[hre.network.name];
    const midToken = await getBdUs(hre);
    const swapTo = await getWeth(hre);
    console.log("path: " + swapFrom.address + " " + swapTo.address);
    const collateralPath = [swapFrom.address, midToken.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = swapFrom.decimals;
    const amountIn = numberToBigNumberFixed(0.001, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdeuPool = await getBDStableWethPool(hre, "BDEU");
    const stableExpectedFromMint = await getBdEu(hre);
    const bdxPath = await getBestBdxPath(hre, swapFrom.address, amountIn, 1, stableExpectedFromMint, wethBdeuPool);
    await zapMintTestContract.addTokenSupportForMinting(swapFrom.address);

    const tokenIn = await getERC20(hre, swapFrom.address);
    await tokenIn.connect(user).approve(zapMintTestContract.address, amountIn);

    const deployerStableBalanceBeforeMint = await stableExpectedFromMint.balanceOf(deployer.address);

    const parameters = {
      amountOutMin: 0,
      bdstableToMintAddress: stableExpectedFromMint.address,
      bdstablePoolAddress: wethBdeuPool.address,
      collateralSwapPath: collateralPath,
      bdxSwapPath: bdxPath,
      amountIn: amountIn,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    await zapMintTestContract.connect(user).zapMint(parameters);

    const deployerStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(deployer.address);
    const stableDiff = deployerStableBalanceAfterMint.sub(deployerStableBalanceBeforeMint);
    expect(stableDiff).to.be.gt(BigNumber.from(0), "Zap mint did not mint anything");
  });

  it("Should not mint when zap mint is paused", async () => {
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    await zapMintTestContract.connect(deployer).pause();
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const collateralPath = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    const bdus = await getBdUs(hre);
    const bdxPath = await getBestBdxPath(hre, swapFrom.address, amountIn, 1, bdus, wethBdusPool);

    const parameters = {
      amountOutMin: 0,
      bdstableToMintAddress: bdus.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: collateralPath,
      bdxSwapPath: bdxPath,
      amountIn: amountIn,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    const mintPromise = zapMintTestContract.connect(user).zapMint(parameters);
    await expectToFail(() => mintPromise, "Pausable: paused");
  });

  it("Should not mint not supported token", async () => {
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const collateralPath = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    const bdus = await getBdUs(hre);
    const bdxPath = await getBestBdxPath(hre, swapFrom.address, amountIn, 1, bdus, wethBdusPool);

    const tokenIn = await getERC20(hre, swapFrom.address);
    await tokenIn.connect(user).approve(zapMintTestContract.address, amountIn);

    const parameters = {
      amountOutMin: 0,
      bdstableToMintAddress: bdus.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: collateralPath,
      bdxSwapPath: bdxPath,
      amountIn: amountIn,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    const mintPromise = zapMintTestContract.connect(user).zapMint(parameters);
    await expectToFail(() => mintPromise, "ZapMint: Collateral path token is not supported for zap minting");
  });

  it("Should mint supported token when 0% < collateral ratio < 100%", async () => {
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const collateralPath = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(0.001, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    await zapMintTestContract.addTokenSupportForMinting(swapFrom.address);

    const cr = 0.7;
    await lockBdusCrAt(hre, cr);

    const stableExpectedFromMint = await getBdUs(hre);
    const bdxPath = await getBestBdxPath(hre, swapFrom.address, amountIn, cr, stableExpectedFromMint, wethBdusPool);

    await swapFrom.connect(user).approve(zapMintTestContract.address, amountIn);

    const bdeuBalanceBeforeMinting_d18 = await swapFrom.balanceOf(deployer.address);
    const bdusBalanceBeforeMinting_d18 = await stableExpectedFromMint.balanceOf(deployer.address);

    const parameters = {
      amountOutMin: 0,
      bdstableToMintAddress: stableExpectedFromMint.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: collateralPath,
      bdxSwapPath: bdxPath,
      amountIn: amountIn,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    await zapMintTestContract.connect(user).zapMint(parameters);

    const bdeuBalanceAfterMinting_d18 = await swapFrom.balanceOf(deployer.address);
    const bdusBalanceAfterMinting_d18 = await stableExpectedFromMint.balanceOf(deployer.address);

    expect(d18_ToNumber(bdeuBalanceAfterMinting_d18)).to.be.closeTo(
      d18_ToNumber(bdeuBalanceBeforeMinting_d18.sub(amountIn)),
      0.001,
      "User should spend amountIn input token"
    );
    expect(d18_ToNumber(bdusBalanceAfterMinting_d18)).to.be.greaterThan(
      d18_ToNumber(bdusBalanceBeforeMinting_d18),
      "User should have more minted token after mint"
    );
  });

  it("Should swap supported token when mint result satisfies minAmountOut", async () => {
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const collateralPath = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    await zapMintTestContract.addTokenSupportForMinting(swapFrom.address);

    await swapFrom.connect(user).approve(zapMintTestContract.address, amountIn);

    const swapsAmountsOut = await router.getAmountsOut(amountIn, collateralPath);
    const swapAmountOut = swapsAmountsOut[swapsAmountsOut.length - 1];
    const stableExpectedFromMint = await getBdUs(hre);
    const wethPriceInUsd_d18 = to_d18((await getOnChainWethFiatPrice(hre, "EUR")).price);
    const mintMinAmountOut = wethPriceInUsd_d18.div(1e9).mul(swapAmountOut).div(1e9);
    const slippedMintMinAmountOut = valueToSlippedValue(mintMinAmountOut);
    const deployerStableBalanceBeforeMint = await stableExpectedFromMint.balanceOf(deployer.address);
    const bdxPath = await getBestBdxPath(hre, swapFrom.address, amountIn, 1, stableExpectedFromMint, wethBdusPool);

    const parameters = {
      amountOutMin: slippedMintMinAmountOut,
      bdstableToMintAddress: stableExpectedFromMint.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: collateralPath,
      bdxSwapPath: bdxPath,
      amountIn: amountIn,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    await zapMintTestContract.connect(user).zapMint(parameters);

    const deployerStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(deployer.address);
    const stableDiff = d18_ToNumber(deployerStableBalanceAfterMint.sub(deployerStableBalanceBeforeMint));
    expect(stableDiff).to.be.greaterThan(d18_ToNumber(mintMinAmountOut), "User should get minimal expected amount out of minted bdstable");
  });

  it("Should not swap supported token when mint result does not satisfy minAmountOut", async () => {
    const deployer = await getDeployer(hre);
    const user = await getUser1(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const collateralPath = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    await zapMintTestContract.addTokenSupportForMinting(swapFrom.address);

    await swapFrom.connect(user).approve(zapMintTestContract.address, amountIn);

    const swapsAmountsOut = await router.getAmountsOut(amountIn, collateralPath);
    const swapAmountOut = swapsAmountsOut[swapsAmountsOut.length - 1];
    const stableExpectedFromMint = await getBdUs(hre);
    const wethPriceInUsd_d18 = to_d18((await getOnChainWethFiatPrice(hre, "EUR")).price);
    const mintMinAmountOut = wethPriceInUsd_d18.div(1e9).mul(swapAmountOut).div(1e9).sub(wethPriceInUsd_d18.mul(0.1));

    // const bdeuBalanceBeforeMinting_d18 = await swapFrom.balanceOf(deployer.address);
    const bdxPath = await getBestBdxPath(hre, swapFrom.address, amountIn, 1, stableExpectedFromMint, wethBdusPool);

    const parameters = {
      amountOutMin: mintMinAmountOut,
      bdstableToMintAddress: stableExpectedFromMint.address,
      bdstablePoolAddress: wethBdusPool.address,
      collateralSwapPath: collateralPath,
      bdxSwapPath: bdxPath,
      amountIn: amountIn,
      router: router.address,
      deadline: currentBlock.timestamp + 1e5
    } as ZapMintParametersStruct;
    const mintPromise = zapMintTestContract.connect(user).zapMint(parameters);

    // const bdeuBalanceAfterMinting_d18 = await swapFrom.balanceOf(deployer.address);
    await expectToFail(() => mintPromise, "ZapMint: Slippage limit reached");
    // expect(d18_ToNumber(bdeuBalanceBeforeMinting_d18)).to.be.closeTo(d18_ToNumber(bdeuBalanceAfterMinting_d18), 0.0001, "Input token should not be spent if mint fails");
  });
});
