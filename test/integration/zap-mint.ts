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
  getTokenData,
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

describe.only("Zap mint", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();
    const deployer = await getDeployer(hre);
    await setUpFunctionalSystemForTests(hre, 1);
    const treasury = await getTreasurySigner(hre);
    const bdx = await getBdx(hre);
    const weth = await getWeth(hre);
    const wbtc = await getWbtc(hre);
    const allInputTokens = await getAllTokensAddresses(hre, [bdx.address, weth.address, wbtc.address]); //tu sie moglo cos zepsuc ale w swpaie? hmm
    for (const token of allInputTokens) {
      const erc20 = await getERC20(hre, token);

      const decimals = await erc20.decimals();
      erc20.connect(treasury).transfer(deployer.address, numberToBigNumberFixed(10, decimals));
    }
  });

  it.skip("Should zap mint for every possible pair (native and non-native tokens)", async () => {
    const deployer = await getDeployer(hre);

    const bdx = await getBdx(hre);
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const weth = await getWeth(hre);
    const router = await getUniswapRouter(hre);

    const wbtc = await getWbtc(hre);
    const collateralTokens = [weth.address, wbtc.address];
    const excludedInputTokens = [bdx.address, weth.address, wbtc.address];
    const allPossibleZapMintPaths = await generateAllPaths(hre, excludedInputTokens, collateralTokens);

    console.log("All collateral pairs (pairs for swap): ");
    for (const path of allPossibleZapMintPaths) {
      const from = (await getTokenData(path[0], hre)).symbol;
      const mid = (await getTokenData(path[1], hre)).symbol;
      if (path.length > 2) {
        const to = (await getTokenData(path[2], hre)).symbol;
        console.log("pair: " + from + " " + mid + " " + to);
      } else {
        console.log("pair: " + from + " " + mid);
      }
    }

    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;

    const allBDStableCollateralPools = await getAllBDStablePools(hre);
    console.log("allBDStableCollateralPools (pools for minting): ");
    for (const pool of allBDStableCollateralPools) {
      const stable = (await getTokenData(await pool.BDSTABLE(), hre)).symbol;
      const collateral = (await getTokenData(await pool.collateral_token(), hre)).symbol;
      console.log("pool: " + stable + " " + collateral);
    }

    for (const possibleZapMintPath of allPossibleZapMintPaths) {
      const swapFrom = possibleZapMintPath[0];
      const swapTo = possibleZapMintPath[possibleZapMintPath.length - 1];
      const midToken = possibleZapMintPath.length > 2 ? (await getTokenData(possibleZapMintPath[1], hre)).symbol : "-";
      const poolsWithProperCollateral: BdStablePool[] = [];
      for (const pool of allBDStableCollateralPools) {
        const collateralTokenAddress = await pool.collateral_token();
        const stableTokenAddress = await pool.BDSTABLE();
        if (collateralTokenAddress === swapTo && stableTokenAddress !== swapFrom) {
          poolsWithProperCollateral.push(pool);
        }
      }

      console.log("poolsWithProperCollateral: ");
      for (const pool of poolsWithProperCollateral) {
        const stable = (await getTokenData(await pool.BDSTABLE(), hre)).symbol;
        const collateral = (await getTokenData(await pool.collateral_token(), hre)).symbol;
        console.log("pool: " + stable + " " + collateral);
      }

      for (const poolWithProperCollateral of poolsWithProperCollateral) {
        const stableExpectedFromMintAddress = await poolWithProperCollateral.BDSTABLE();
        const stableExpectedFromMint = (await hre.ethers.getContractAt("IERC20", stableExpectedFromMintAddress)) as IERC20;
        console.log("\n");
        console.log(
          "swapping from " + (await getTokenData(swapFrom, hre)).symbol + " via " + midToken + " to " + (await getTokenData(swapTo, hre)).symbol
        );
        console.log(
          "swapping from " + possibleZapMintPath[0] + " via " + possibleZapMintPath[1] + " to " + possibleZapMintPath[possibleZapMintPath.length - 1]
        );
        console.log(
          "using pool " +
            (await getTokenData(stableExpectedFromMintAddress, hre)).symbol +
            " " +
            (await getTokenData(await poolWithProperCollateral.collateral_token(), hre)).symbol
        );
        const tokenToApproveAndTranfer = await getERC20(hre, swapFrom);

        console.log(
          "deployer " + (await getTokenData(swapFrom, hre)).symbol + " balance " + (await tokenToApproveAndTranfer.balanceOf(deployer.address))
        );
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
          await router.resolvedAddress,
          currentBlock.timestamp + 1e5
        );
        const deployerStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(deployer.address);
        const stableDiff = deployerStableBalanceAfterMint.sub(deployerStableBalanceBeforeMint);
        expect(stableDiff).to.be.gt(BigNumber.from(0), "Zap mint did not mint anything");
      }
    }
  });

  it.skip("Should mint supported non-direct path", async () => {
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
      await router.resolvedAddress,
      currentBlock.timestamp + 1e5
    );

    const deployerStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(deployer.address);
    const stableDiff = deployerStableBalanceAfterMint.sub(deployerStableBalanceBeforeMint);
    expect(stableDiff).to.be.gt(BigNumber.from(0), "Zap mint did not mint anything");
  });

  it.skip("TEST Should swap zap mint direct path - working", async () => {
    const deployer = await getDeployer(hre);
    const currentBlock = await hre.ethers.provider.getBlock("latest");

    const bdx = await getBdx(hre);
    const weth = await getWeth(hre);
    const router = await getUniswapRouter(hre);

    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const amountIn = to_d18(1);
    await weth.approve(zapMintTestContract.address, amountIn);
    console.log("bdx balance before: " + (await bdx.balanceOf(zapMintTestContract.address)));
    await zapMintTestContract.swapTest(
      0,
      [weth.address, bdx.address],
      deployer.address,
      amountIn,
      await router.resolvedAddress,
      currentBlock.timestamp + 1e5
    );
    console.log("bdx balance after: " + (await bdx.balanceOf(zapMintTestContract.address)));
  });

  it.skip("TEST Should swap zap mint direct path - tokens", async () => {
    const deployer = await getDeployer(hre);
    const currentBlock = await hre.ethers.provider.getBlock("latest");

    const bdeu = await getBdEu(hre);
    const weth = await getWeth(hre);
    const router = await getUniswapRouter(hre);

    const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;
    const amountIn = to_d18(1);
    await bdeu.approve(zapMintTestContract.address, amountIn);
    console.log("weth balance before: " + (await weth.balanceOf(zapMintTestContract.address)));
    await zapMintTestContract.swapTest(
      0,
      [bdeu.address, weth.address],
      deployer.address,
      amountIn,
      await router.resolvedAddress,
      currentBlock.timestamp + 1e5
    );
    console.log("weth balance after: " + (await weth.balanceOf(zapMintTestContract.address)));
  });

  // it.skip("TEST Should swap", async () => {
  //   const deployer = await getDeployer(hre);
  //   const currentBlock = await hre.ethers.provider.getBlock("latest");

  //   const bdeu = await getBdEu(hre);
  //   const weth = await getWeth(hre);
  //   const router = await getUniswapRouter(hre);

  //   const zapMintTestContract = (await hre.ethers.getContract("ZapMint", deployer)) as ZapMint;

  //   const amountIn = to_d18(1);
  //   await bdeu.approve(zapMintTestContract.address, amountIn);
  //   console.log("weth balance before: " + (await weth.balanceOf(zapMintTestContract.address)));
  //   await zapMintTestContract.swapInternal(
  //     true,
  //     [bdeu.address, weth.address],
  //     amountIn,
  //     await router.resolvedAddress,
  //     currentBlock.timestamp + 1e5
  //   );
  //   console.log("weth balance after: " + (await weth.balanceOf(zapMintTestContract.address)));
  // });

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
      to_d18(0),
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

  it.skip("Should not mint after toggle zap mint", async () => {
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
      await router.resolvedAddress,
      currentBlock.timestamp + 1e5
    );
    await expectToFail(() => mintPromise, "ZapMint: Status is paused");
  });

  it.skip("Should not mint not supported token", async () => {
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
      await router.resolvedAddress,
      currentBlock.timestamp + 1e5
    );
    await expectToFail(() => mintPromise, "ZapMint: Token not supported for zap minting");
  });
});
