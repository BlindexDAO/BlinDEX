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
  getTreasurySigner,
  getUniswapRouter,
  getWbtc,
  getWeth
} from "../../utils/DeployedContractsHelpers";
import { numberToBigNumberFixed, to_d18 } from "../../utils/NumbersHelpers";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import { generateAllPaths, getAllTokensAddresses } from "../../utils/UniswapPoolsHelpers";
import { IERC20 } from "../../typechain/IERC20";
import { BdStablePool } from "../../typechain/BdStablePool";
import { expectToFail } from "../helpers/common";

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
    const bdx = await getBdx(hre);
    const weth = await getWeth(hre);
    const wbtc = await getWbtc(hre);
    const allInputTokens = await getAllTokensAddresses(hre, [bdx.address, weth.address, wbtc.address]);
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
    await expectToFail(() => mintPromise, "ZapMint: Status is paused");
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
    await expectToFail(() => mintPromise, "ZapMint: Token not supported for zap minting");
  });
});
