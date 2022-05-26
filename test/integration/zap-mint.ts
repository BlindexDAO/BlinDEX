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
    console.log("fixture");
    await hre.deployments.fixture();

    // console.log("starting deployment: ZapMint");

    // const deployer = await getDeployer(hre);
    // await hre.deployments.deploy("ZapMint", {
    //   from: deployer.address,
    //   proxy: {
    //     proxyContract: "OptimizedTransparentProxy"
    //   },
    //   contract: "ZapMint",
    //   args: []
    // });

    const deployer = await getDeployer(hre);
    console.log("setup system");
    await setUpFunctionalSystemForTests(hre, 1);
    console.log("setuped system");
    const treasury = await getTreasurySigner(hre);
    const bdx = await getBdx(hre);
    const allInputTokens = await getAllTokensAddresses(hre, [bdx.address]);
    for (const token of allInputTokens) {
      console.log("transferring token: " + (await getTokenData(token, hre)).symbol);
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
    const allPossibleZapMintPaths = await generateAllPaths(hre, bdx.address, collateralTokens);

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
        if (collateralTokenAddress === swapTo) {
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
        const tokenToApproveAndTranfer = (await hre.ethers.getContractAt("IERC20", swapFrom)) as IERC20;

        console.log(
          "deployer " + (await getTokenData(swapFrom, hre)).symbol + " balance " + (await tokenToApproveAndTranfer.balanceOf(deployer.address))
        );
        const erc20 = await getERC20(hre, swapFrom);
        const decimals = await erc20.decimals();
        const amountIn = numberToBigNumberFixed(0.01, decimals);

        let deployerStableBalanceBeforeMint = await stableExpectedFromMint.balanceOf(deployer.address);
        if (stableExpectedFromMintAddress === possibleZapMintPath[0]) {
          deployerStableBalanceBeforeMint = deployerStableBalanceBeforeMint.sub(amountIn);
        }
        await tokenToApproveAndTranfer.approve(zapMintTestContract.address, amountIn);
        await zapMintTestContract.swapToZapMintAndMintAllPairsTest(
          await router.resolvedAddress,
          amountIn,
          possibleZapMintPath,
          currentBlock.timestamp + 1e5,
          poolWithProperCollateral.address,
          possibleZapMintPath[possibleZapMintPath.length - 1] === weth.address
        );

        const deployerStableBalanceAfterMint = await stableExpectedFromMint.balanceOf(deployer.address);
        const stableDiff = deployerStableBalanceAfterMint.sub(deployerStableBalanceBeforeMint);
        expect(stableDiff).to.be.gt(BigNumber.from(0), "Zap mint did not mint anything");
      }
    }
  });

  it("Should mint supported token", async () => {
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
    await zapMintTestContract.addTokenSupportForMinting(swapFrom.address);

    const bdeu = await getERC20(hre, swapFrom.address);
    await bdeu.approve(zapMintTestContract.address, amountIn);

    await zapMintTestContract.mintUniswapRouterOnly(
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
  });

  it("Should not mint after toggle zap mint", async () => {
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
      await router.resolvedAddress,
      currentBlock.timestamp + 1e5
    );
    await expectToFail(() => mintPromise, "ZapMint: Token not supported for zap minting");
  });
});
