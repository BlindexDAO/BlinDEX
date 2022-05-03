import type { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { BDStable } from "../../typechain/BDStable";
import { bigNumberToDecimal, to_d18 } from "../../utils/NumbersHelpers";
import * as constants from "../../utils/Constants";
import type { UniswapV2Router02 } from "../../typechain/UniswapV2Router02";
import type { ERC20 } from "../../typechain/ERC20";
import { formatAddress, getWethPairOracle, mintWeth } from "../../utils/DeployedContractsHelpers";
import { getDeployer, getUniswapRouter, getWeth } from "../../utils/DeployedContractsHelpers";
import { UniswapV2Router02__factory } from "../../typechain/factories/UniswapV2Router02__factory";
import type { BigNumber } from "ethers";
import type { IERC20 } from "../../typechain/IERC20";

export async function updateWethPair(hre: HardhatRuntimeEnvironment, tokenName: string) {
  const oracle = await getWethPairOracle(hre, tokenName);

  await oracle.updateOracle();
}

export async function swapWethFor(hre: HardhatRuntimeEnvironment, signer: SignerWithAddress, bdStableName: string, wEthToSwap: number) {
  const bdStable = (await hre.ethers.getContract(bdStableName)) as BDStable;

  const uniswapV2Router02 = (await hre.ethers.getContract("UniswapV2Router02", signer)) as UniswapV2Router02;

  const currentBlock = await hre.ethers.provider.getBlock("latest");

  const weth = await (await getWeth(hre)).connect(signer);
  await mintWeth(hre, signer, to_d18(100));

  await weth.approve(uniswapV2Router02.address, to_d18(wEthToSwap));
  await uniswapV2Router02.swapExactTokensForTokens(
    to_d18(wEthToSwap),
    1,
    [formatAddress(hre, constants.wrappedNativeTokenData[hre.network.name].address), formatAddress(hre, bdStable.address)],
    formatAddress(hre, signer.address),
    currentBlock.timestamp + 24 * 60 * 60 * 7
  );

  console.log("Swapped WETH for " + bdStableName);
}

export async function swapAsDeployer(
  hre: HardhatRuntimeEnvironment,
  tokenInName: string,
  tokenOutName: string,
  tokenInValue: number,
  tokenOutMinValue: number
) {
  const deployer = await getDeployer(hre);

  const tokenIn = (await hre.ethers.getContract(tokenInName, formatAddress(hre, deployer.address))) as ERC20;
  const tokenOut = (await hre.ethers.getContract(tokenOutName, formatAddress(hre, deployer.address))) as ERC20;

  await swapAsDeployerByContract(hre, tokenIn, tokenOut, tokenInValue, tokenOutMinValue);

  console.log(`Swapped ${tokenInName} for ${tokenOutName}`);
}

export async function swapWethAsDeployer(hre: HardhatRuntimeEnvironment, tokenOutName: string, wethInValue: number, tokenMinOutValue: number) {
  const deployer = await getDeployer(hre);

  const tokenIn = await getWeth(hre);
  const tokenOut = (await hre.ethers.getContract(tokenOutName, formatAddress(hre, deployer.address))) as ERC20;

  await swapAsDeployerByContract(hre, tokenIn, tokenOut, wethInValue, tokenMinOutValue);

  console.log(`Swapped WETH for ${tokenOutName}`);
}

export async function swapForWethAsDeployer(hre: HardhatRuntimeEnvironment, tokenInName: string, tokenInValue: number, wethMinOutValue: number) {
  const deployer = await getDeployer(hre);

  const tokenIn = (await hre.ethers.getContract(tokenInName, formatAddress(hre, deployer.address))) as ERC20;
  const tokenOut = await getWeth(hre);

  await swapAsDeployerByContract(hre, tokenIn, tokenOut, tokenInValue, wethMinOutValue);

  console.log(`Swapped ${tokenInName} for WETH`);
}

export async function swapAsDeployerByContract(
  hre: HardhatRuntimeEnvironment,
  tokenIn: IERC20,
  tokenOut: IERC20,
  tokenInValue: number,
  tokenOutMinValue: number
) {
  const deployer = await getDeployer(hre);

  const uniswapV2Router02 = await getUniswapRouter(hre);

  const currentBlock = await hre.ethers.provider.getBlock("latest");

  await tokenIn.approve(formatAddress(hre, uniswapV2Router02.address), to_d18(tokenInValue));
  await uniswapV2Router02.swapExactTokensForTokens(
    to_d18(tokenInValue),
    to_d18(tokenOutMinValue),
    [formatAddress(hre, tokenIn.address), formatAddress(hre, tokenOut.address)],
    formatAddress(hre, deployer.address),
    currentBlock.timestamp + 24 * 60 * 60 * 7
  );
}

export async function getWethOraclePrices(hre: HardhatRuntimeEnvironment, bdStableName: string) {
  const bdStable = (await hre.ethers.getContract(bdStableName)) as BDStable;

  const oracle = await getWethPairOracle(hre, bdStableName);

  const wethInBdStablePrice_d18 = await oracle.consult(formatAddress(hre, constants.wrappedNativeTokenData[hre.network.name].address), to_d18(1));
  const bdStableWethPrice_d18 = await oracle.consult(formatAddress(hre, bdStable.address), to_d18(1));

  const wethInBdStableOraclePrice = bigNumberToDecimal(wethInBdStablePrice_d18, 18);
  const bdStableInWethOraclePrice = bigNumberToDecimal(bdStableWethPrice_d18, 18);

  console.log(`WETH in ${bdStableName} price: ` + wethInBdStableOraclePrice);
  console.log(`${bdStableName} in WETH price: ` + bdStableInWethOraclePrice);

  return { wethInBdStableOraclePrice, bdStableInWethOraclePrice };
}

export async function provideLiquidity(
  hre: HardhatRuntimeEnvironment,
  user: SignerWithAddress,
  tokenA: IERC20,
  tokenB: IERC20,
  amountA: BigNumber,
  amountB: BigNumber,
  verbose: boolean
) {
  const router = await getUniswapRouter(hre);

  await (await tokenA.connect(user).approve(formatAddress(hre, router.address), amountA)).wait();
  await (await tokenB.connect(user).approve(formatAddress(hre, router.address), amountB)).wait();

  const currentBlock = await hre.ethers.provider.getBlock("latest");

  if (verbose) {
    console.log("balanceA: " + (await tokenA.balanceOf(formatAddress(hre, user.address))));
    console.log("amountA : " + amountA);
    console.log("balanceB: " + (await tokenB.balanceOf(formatAddress(hre, user.address))));
    console.log("amountB : " + amountB);
  }
  // router routes to the proper pair
  await (
    await router
      .connect(user)
      .addLiquidity(
        formatAddress(hre, tokenA.address),
        formatAddress(hre, tokenB.address),
        amountA,
        amountB,
        1,
        1,
        formatAddress(hre, user.address),
        currentBlock.timestamp + 600
      )
  ).wait();
}

export async function swapEthForWbtc(hre: HardhatRuntimeEnvironment, account: SignerWithAddress, amountETH: BigNumber) {
  // swaps ETH for WETH internally

  const uniRouter = UniswapV2Router02__factory.connect(formatAddress(hre, constants.ETH_uniswapRouterAddress), account);
  await uniRouter
    .connect(account)
    .swapExactETHForTokens(
      0,
      [
        formatAddress(hre, constants.wrappedNativeTokenData[hre.network.name].address),
        formatAddress(hre, constants.wrappedSecondaryTokenData[hre.network.name].address)
      ],
      formatAddress(hre, account.address),
      Date.now() + 3600,
      {
        value: amountETH
      }
    );
}
