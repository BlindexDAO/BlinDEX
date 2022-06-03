import { EXTERNAL_USD_STABLE } from "./../../utils/Constants";
import { BigNumber } from "ethers";
import hre from "hardhat";
import { ZapMint } from "./../../typechain/ZapMint";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import {
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
  getWbtc,
  getWeth
} from "../../utils/DeployedContractsHelpers";
import { d18_ToNumber, numberToBigNumberFixed, to_d12, to_d18, to_d8 } from "../../utils/NumbersHelpers";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import { generateAllPaths, getAllTokensAddresses } from "../../utils/UniswapPoolsHelpers";
import { IERC20 } from "../../typechain/IERC20";
import { BdStablePool } from "../../typechain/BdStablePool";
import { expectToFail } from "../helpers/common";
import { lockBdusCrAt } from "../helpers/bdStable";

function valueToSlippedValue(input: BigNumber) {
  const one_d12 = to_d12(1);
  const slippage_d12 = to_d12(0.02);
  const multiplier_d12 = one_d12.sub(slippage_d12);
  return input.mul(multiplier_d12).div(1e12);
}

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

//todo
//add test for collateral ratio < 100% (mint which use bdx)
//use one initialized zapmint object for all tests..? (alternatively - move initialization to private method)
//move common variables to constants (like deadline, router)
//add test for zap minting directly from ETH/WBTC (ETH/WBTC in path[0], path.length = 1)
//add tests for all require statements
//add test for reentrancy?
describe("Zap mint", () => {
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
    const bdx = await getBdx(hre);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const weth = await getWeth(hre);
    const router = await getUniswapRouter(hre);

    const wbtc = await getWbtc(hre);
    const collateralTokens = [weth.address, wbtc.address];
    const excludedInputTokens = [bdx.address, weth.address, wbtc.address];
    const allPossibleZapMintPaths = await generateAllPaths(hre, excludedInputTokens, collateralTokens);

    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;

    const allBDStableCollateralPools = await getAllBDStablePools(hre);

    for (const possibleZapMintPath of allPossibleZapMintPaths) {
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
        const stableExpectedFromMint = (await hre.ethers.getContractAt("IERC20", stableExpectedFromMintAddress)) as IERC20;
        const tokenToApproveAndTranfer = await getERC20(hre, swapFrom);
        const erc20 = await getERC20(hre, swapFrom);
        const decimals = await erc20.decimals();
        const amountIn = numberToBigNumberFixed(0.01, decimals);

        const deployerStableBalanceBeforeMint = await stableExpectedFromMint.balanceOf(deployer.address);
        await tokenToApproveAndTranfer.approve(zapMintTestContract.address, amountIn);
        await zapMintTestContract.addTokenSupportForMinting(possibleZapMintPath[0]);
        await zapMintTestContract.mintUniswapRouterOnly(
          0,
          0,
          possibleZapMintPath[possibleZapMintPath.length - 1] === weth.address,
          stableExpectedFromMintAddress,
          poolWithProperCollateral.address,
          possibleZapMintPath,
          amountIn,
          router.address,
          currentBlock.timestamp + 1e5
        );
        const deployerStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(deployer.address);
        const stableDiff = deployerStableBalanceAfterMint.sub(deployerStableBalanceBeforeMint);
        expect(stableDiff).to.be.gt(BigNumber.from(0), "Zap mint did not mint anything");
      }
    }
  });

  it("Should mint supported direct path", async () => {
    const deployer = await getDeployer(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const path = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    await zapMintTestContract.addTokenSupportForMinting(swapFrom.address);

    await swapFrom.approve(zapMintTestContract.address, amountIn);

    const stableExpectedFromMint = await getBdUs(hre);
    const deployerStableBalanceBeforeMint = await stableExpectedFromMint.balanceOf(deployer.address);
    await zapMintTestContract.mintUniswapRouterOnly(
      0,
      0,
      true,
      stableExpectedFromMint.address,
      wethBdusPool.address,
      path,
      amountIn,
      router.address,
      currentBlock.timestamp + 1e5
    );

    const deployerStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(deployer.address);
    const stableDiff = deployerStableBalanceAfterMint.sub(deployerStableBalanceBeforeMint);
    expect(stableDiff).to.be.gt(BigNumber.from(0), "Zap mint did not mint anything");
  });

  it("Should mint supported non-direct path", async () => {
    const deployer = await getDeployer(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = EXTERNAL_USD_STABLE[hre.network.name];
    const midToken = await getBdUs(hre);
    const swapTo = await getWeth(hre);
    console.log("path: " + swapFrom.address + " " + swapTo.address);
    const path = [swapFrom.address, midToken.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = swapFrom.decimals;
    const amountIn = numberToBigNumberFixed(0.01, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdeuPool = await getBDStableWethPool(hre, "BDEU");
    const stableExpectedFromMint = await getBdEu(hre);
    await zapMintTestContract.addTokenSupportForMinting(swapFrom.address);

    const tokenIn = await getERC20(hre, swapFrom.address);
    await tokenIn.approve(zapMintTestContract.address, amountIn);

    const deployerStableBalanceBeforeMint = await stableExpectedFromMint.balanceOf(deployer.address);
    await zapMintTestContract.mintUniswapRouterOnly(
      0,
      0,
      true,
      stableExpectedFromMint.address,
      wethBdeuPool.address,
      path,
      amountIn,
      router.address,
      currentBlock.timestamp + 1e5
    );

    const deployerStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(deployer.address);
    const stableDiff = deployerStableBalanceAfterMint.sub(deployerStableBalanceBeforeMint);
    expect(stableDiff).to.be.gt(BigNumber.from(0), "Zap mint did not mint anything");
  });

  it("Should not mint when zap mint is paused", async () => {
    const deployer = await getDeployer(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    await zapMintTestContract.connect(deployer).toggleZapMinting();
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const path = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    const bdus = await getBdUs(hre);

    const mintPromise = zapMintTestContract.mintUniswapRouterOnly(
      to_d18(0),
      0,
      true,
      bdus.address,
      wethBdusPool.address,
      path,
      amountIn,
      router.address,
      currentBlock.timestamp + 1e5
    );
    await expectToFail(() => mintPromise, "ZapMint: Contract is paused");
  });

  it("Should not mint not supported token", async () => {
    const deployer = await getDeployer(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const path = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    const bdus = await getBdUs(hre);

    const mintPromise = zapMintTestContract.mintUniswapRouterOnly(
      to_d18(0),
      0,
      true,
      bdus.address,
      wethBdusPool.address,
      path,
      amountIn,
      router.address,
      currentBlock.timestamp + 1e5
    );
    await expectToFail(() => mintPromise, "ZapMint: Token is not supported for zap minting");
  });

  it("Should not mint supported token when 0% < collateral ratio < 100% and bdx was not provided", async () => {
    const deployer = await getDeployer(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const path = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    await zapMintTestContract.addTokenSupportForMinting(swapFrom.address);

    await swapFrom.approve(zapMintTestContract.address, amountIn);

    const cr = 0.7;
    await lockBdusCrAt(hre, cr);

    const stableExpectedFromMint = await getBdUs(hre);
    const mintPromise = zapMintTestContract.mintUniswapRouterOnly(
      0,
      0,
      true,
      stableExpectedFromMint.address,
      wethBdusPool.address,
      path,
      amountIn,
      router.address,
      currentBlock.timestamp + 1e5
    );

    await expectToFail(() => mintPromise, "Not enough BDX inputted");
  });

  it("Should mint supported token when 0% < collateral ratio < 100% and bdx was provided", async () => {
    const deployer = await getDeployer(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const path = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(0.01, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    await zapMintTestContract.addTokenSupportForMinting(swapFrom.address);

    const bdx = await getBdx(hre);

    const cr = 0.7;
    await lockBdusCrAt(hre, cr);

    const bdus = await getBdUs(hre);
    const bdxInUsdPrice_d12 = await bdus.BDX_price_d12();
    const wethInUsdPrice_d12 = await wethBdusPool.getCollateralPrice_d12();
    const bdxPriceInWeth_d12 = BigNumber.from(1e12).mul(wethInUsdPrice_d12).div(bdxInUsdPrice_d12);

    const bdxInMax = amountIn
      .mul(to_d8(1 - cr))
      .div(to_d8(cr))
      .mul(bdxPriceInWeth_d12)
      .div(1e12); // the remaining 30% of value

    const stableExpectedFromMint = await getBdUs(hre);

    await bdx.approve(zapMintTestContract.address, bdxInMax.mul(2));
    await swapFrom.approve(zapMintTestContract.address, amountIn);

    const bdeuBalanceBeforeMinting_d18 = await swapFrom.balanceOf(deployer.address);
    const bdusBalanceBeforeMinting_d18 = await stableExpectedFromMint.balanceOf(deployer.address);
    const bdxBalanceBeforeMinting_d18 = await bdx.balanceOf(deployer.address);

    await zapMintTestContract.mintUniswapRouterOnly(
      bdxInMax,
      0,
      true,
      stableExpectedFromMint.address,
      wethBdusPool.address,
      path,
      amountIn,
      router.address,
      currentBlock.timestamp + 1e5
    );

    const bdeuBalanceAfterMinting_d18 = await swapFrom.balanceOf(deployer.address);
    const bdusBalanceAfterMinting_d18 = await stableExpectedFromMint.balanceOf(deployer.address);
    const bdxBalanceAfterMinting_d18 = await bdx.balanceOf(deployer.address);

    expect(d18_ToNumber(bdeuBalanceAfterMinting_d18)).to.be.closeTo(
      d18_ToNumber(bdeuBalanceBeforeMinting_d18.sub(amountIn)),
      0.001,
      "Deployer should spend amountIn input token"
    );
    expect(d18_ToNumber(bdusBalanceAfterMinting_d18)).to.be.greaterThan(
      d18_ToNumber(bdusBalanceBeforeMinting_d18),
      "Deployer should have more minted token after mint"
    );
    expect(d18_ToNumber(bdxBalanceAfterMinting_d18)).to.be.closeTo(
      d18_ToNumber(bdxBalanceBeforeMinting_d18.sub(bdxInMax)),
      0.001,
      "Deployer should spend bdxInMax input token"
    );
  });

  it("Should swap supported token when mint result satisfies minAmountOut", async () => {
    const deployer = await getDeployer(hre);
    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const swapFrom = await getBdEu(hre);
    const swapTo = await getWeth(hre);
    const path = [swapFrom.address, swapTo.address];
    const router = await getUniswapRouter(hre);
    const decimals = await swapFrom.decimals();
    const amountIn = numberToBigNumberFixed(1, decimals);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const wethBdusPool = await getBDStableWethPool(hre, "BDUS");
    await zapMintTestContract.addTokenSupportForMinting(swapFrom.address);

    await swapFrom.approve(zapMintTestContract.address, amountIn);

    const swapsAmountsOut = await router.getAmountsOut(amountIn, path);
    const swapAmountOut = swapsAmountsOut[swapsAmountsOut.length - 1];
    const stableExpectedFromMint = await getBdUs(hre);
    const wethPriceInUsd_d18 = to_d18((await getOnChainWethFiatPrice(hre, "EUR")).price);
    console.log("wethPriceInUsd_d18: " + d18_ToNumber(wethPriceInUsd_d18));
    console.log("swapAmountOut: " + d18_ToNumber(swapAmountOut));
    const mintMinAmountOut = wethPriceInUsd_d18.div(1e9).mul(swapAmountOut).div(1e9);
    console.log("mintMinamountout: " + d18_ToNumber(mintMinAmountOut));
    const slippedMintMinAmountOut = valueToSlippedValue(mintMinAmountOut);
    console.log("slippedMintMinAmountOut: " + d18_ToNumber(slippedMintMinAmountOut));
    const deployerStableBalanceBeforeMint = await stableExpectedFromMint.balanceOf(deployer.address);
    await zapMintTestContract.mintUniswapRouterOnly(
      0,
      mintMinAmountOut,
      true,
      stableExpectedFromMint.address,
      wethBdusPool.address,
      path,
      amountIn,
      router.address,
      currentBlock.timestamp + 1e5
    );

    const deployerStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(deployer.address);
    const stableDiff = d18_ToNumber(deployerStableBalanceAfterMint.sub(deployerStableBalanceBeforeMint));
    expect(stableDiff).to.be.greaterThan(d18_ToNumber(mintMinAmountOut), "Deployer should get minimal expected amount out of minted bdstable");
  });
});
