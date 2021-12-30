import type { IERC20 } from "../typechain/IERC20";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { BDStable } from "../typechain/BDStable";
import type { BdStablePool } from "../typechain/BdStablePool";
import type { BDXShares } from "../typechain/BDXShares";
import type { AggregatorV3Interface } from "../typechain/AggregatorV3Interface";
import type { ERC20 } from "../typechain/ERC20";
import { UniswapV2Router02__factory } from "../typechain/factories/UniswapV2Router02__factory";
import type { UniswapV2Factory } from "../typechain/UniswapV2Factory";
import type { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import type { UniswapV2Router02 } from "../typechain/UniswapV2Router02";
import type { BigNumber } from "@ethersproject/bignumber";
import * as constants from "./Constants";
import type { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { bigNumberToDecimal, to_d12 } from "./NumbersHelpers";
import type { StakingRewardsDistribution } from "../typechain/StakingRewardsDistribution";
import type { Vesting } from "../typechain/Vesting";
import type { UniswapPairOracle } from "../typechain/UniswapPairOracle";
import type { IWETH } from "../typechain/IWETH";
import { ContractsDetails as bdstablesContractsDetails } from "../deploy/2_2_euro_usd_stablecoins";
import { getPoolKey } from "./UniswapPoolsHelpers";
import type { StakingRewards } from "../typechain/StakingRewards";
import type { UpdaterRSK } from "../typechain/UpdaterRSK";

export function getAllBDStablesSymbols(): string[] {
  return Object.values(bdstablesContractsDetails).map(stable => stable.symbol);
}

export async function getAllBDStables(hre: HardhatRuntimeEnvironment): Promise<BDStable[]> {
  const allStables = [];

  for (const symbol of getAllBDStablesSymbols()) {
    allStables.push(await getBDStable(hre, symbol));
  }

  return allStables;
}

export async function getAllBDStablePools(hre: HardhatRuntimeEnvironment): Promise<BdStablePool[]> {
  const allStablePools = [];

  for (const symbol of getAllBDStablesSymbols()) {
    allStablePools.push(await getBDStableWbtcPool(hre, symbol));
    allStablePools.push(await getBDStableWethPool(hre, symbol));
  }

  return allStablePools;
}

export async function getDeployer(hre: HardhatRuntimeEnvironment) {
  const deployer = await hre.ethers.getNamedSigner("DEPLOYER");
  return deployer;
}

export async function getBot(hre: HardhatRuntimeEnvironment) {
  const bot = await hre.ethers.getNamedSigner("BOT");
  return bot;
}

export async function getDevTreasury(hre: HardhatRuntimeEnvironment) {
  const bot = await hre.ethers.getNamedSigner("DEV_TREASURY");
  return bot;
}

export async function getUser(hre: HardhatRuntimeEnvironment): Promise<SignerWithAddress> {
  const user = await hre.ethers.getNamedSigner("TEST2");
  return user;
}

export async function getTreasury(hre: HardhatRuntimeEnvironment): Promise<SignerWithAddress> {
  const user = await hre.ethers.getNamedSigner("TREASURY");
  return user;
}

export async function getBDStableWbtcPool(hre: HardhatRuntimeEnvironment, symbol: string) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract(bdstablesContractsDetails[symbol].pools.wbtc.name, deployer)) as BdStablePool;
}

export async function getBDStableWethPool(hre: HardhatRuntimeEnvironment, symbol: string) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract(bdstablesContractsDetails[symbol].pools.weth.name, deployer)) as BdStablePool;
}

export async function getBDStableWethStakingRewards(hre: HardhatRuntimeEnvironment, stableSymbol: string) {
  return await getBDStableCollateralStakingRewards(hre, stableSymbol, "WETH");
}

export async function getBDStableWbtcStakingRewards(hre: HardhatRuntimeEnvironment, stableSymbol: string) {
  return await getBDStableCollateralStakingRewards(hre, stableSymbol, "WBTC");
}

export async function getBDStableBdxStakingRewards(hre: HardhatRuntimeEnvironment, stableSymbol: string) {
  return await getBDStableCollateralStakingRewards(hre, stableSymbol, "BDX");
}

async function getBDStableCollateralStakingRewards(hre: HardhatRuntimeEnvironment, stableSymbol: string, collateralSymbol: string) {
  const deployer = await getDeployer(hre);

  const collateralAddress = await getContratAddress(hre, collateralSymbol);
  const stableAddress = await getContratAddress(hre, stableSymbol);
  const poolKey = getPoolKey(collateralAddress, stableAddress, collateralSymbol, stableSymbol);

  return (await hre.ethers.getContract(`StakingRewards_${poolKey}`, deployer)) as StakingRewards;
}

export async function getAllBDStableStakingRewards(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  const bdstablesSymbols = getAllBDStablesSymbols();
  const bdx = await getBdx(hre);
  const stakingRewards = [];
  const stakingRewardsStablesMap = new Set<string>();

  stakingRewards.push(await getBDStableWethStakingRewards(hre, await bdx.symbol()));
  stakingRewards.push(await getBDStableWbtcStakingRewards(hre, await bdx.symbol()));

  for (const symbol of bdstablesSymbols) {
    stakingRewards.push(await getBDStableWethStakingRewards(hre, symbol));
    stakingRewards.push(await getBDStableWbtcStakingRewards(hre, symbol));
    stakingRewards.push(await getBDStableBdxStakingRewards(hre, symbol));

    for (const symbolB of bdstablesSymbols) {
      const stableAddress = await getContratAddress(hre, symbol);
      const stableBAddress = await getContratAddress(hre, symbolB);
      const poolKey = getPoolKey(stableBAddress, stableAddress, symbolB, symbol);

      // Do not repeat the same staking rewards twice
      if (symbol !== symbolB && !stakingRewardsStablesMap.has(poolKey)) {
        stakingRewards.push((await hre.ethers.getContract(`StakingRewards_${poolKey}`, deployer)) as StakingRewards);
      }
    }
  }

  return stakingRewards;
}

export function getBDStableFiat(symbol: string) {
  return bdstablesContractsDetails[symbol].fiat;
}

export async function getBdEu(hre: HardhatRuntimeEnvironment) {
  return getBDStable(hre, "BDEU");
}

export async function getBdUs(hre: HardhatRuntimeEnvironment) {
  return getBDStable(hre, "BDUS");
}

export async function getBdEuWethPool(hre: HardhatRuntimeEnvironment): Promise<BdStablePool> {
  return getBDStableWethPool(hre, "BDEU");
}

export async function getBdEuWbtcPool(hre: HardhatRuntimeEnvironment): Promise<BdStablePool> {
  return getBDStableWbtcPool(hre, "BDEU");
}

export async function getUniswapRouter(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract("UniswapV2Router02", deployer)) as UniswapV2Router02;
}

export async function getUniswapFactory(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract("UniswapV2Factory", deployer)) as UniswapV2Factory;
}

export async function getStakingRewardsDistribution(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract("StakingRewardsDistribution", deployer)) as StakingRewardsDistribution;
}

export async function getVesting(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract("Vesting", deployer)) as Vesting;
}

export async function getBdx(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract("BDX", deployer)) as BDXShares;
}

export async function getWeth(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContractAt("IWETH", formatAddress(hre, constants.wETH_address[hre.network.name]), deployer)) as IERC20;
}

export async function getWethConcrete(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContractAt("IWETH", formatAddress(hre, constants.wETH_address[hre.network.name]), deployer)) as IWETH;
}

export async function getWbtc(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContractAt("ERC20", formatAddress(hre, constants.wBTC_address[hre.network.name]), deployer)) as ERC20;
}

export async function getIERC20(hre: HardhatRuntimeEnvironment, address: string) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContractAt("IERC20", formatAddress(hre, address), deployer)) as IERC20;
}

export async function getERC20(hre: HardhatRuntimeEnvironment, address: string) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContractAt("ERC20", formatAddress(hre, address), deployer)) as ERC20;
}

export async function mintWbtc(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, amount_d8: BigNumber, maxBtcEthPrice: number) {
  const uniRouter = UniswapV2Router02__factory.connect(constants.ETH_uniswapRouterAddress, user);
  const networkName = hre.network.name;

  await (
    await uniRouter.swapETHForExactTokens(
      amount_d8,
      [constants.wETH_address[networkName], constants.wBTC_address[networkName]],
      user.address,
      Date.now() + 3600,
      {
        value: amount_d8.mul(1e10).mul(maxBtcEthPrice) // mul*1e10 : align precision // second mul(maxBtcEthPrice) : excessive amount of eth, we'll get the rest back
      }
    )
  ).wait();
}

export async function mintWeth(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, amount: BigNumber) {
  const weth = await getWethConcrete(hre);
  await weth.connect(user).deposit({ value: amount });
}

export async function getOnChainBtcEurPrice(hre: HardhatRuntimeEnvironment) {
  const networkName = hre.network.name;

  return getOnChainCryptoFiatPrice(hre, constants.EUR_USD_FEED_ADDRESS[networkName], constants.BTC_USD_FEED_ADDRESS[networkName]);
}

export async function getOnChainEthEurPrice(hre: HardhatRuntimeEnvironment) {
  const networkName = hre.network.name;

  return getOnChainCryptoFiatPrice(hre, constants.EUR_USD_FEED_ADDRESS[networkName], constants.ETH_USD_FEED_ADDRESS[networkName]);
}

export async function getOnChainWethUsdPrice(hre: HardhatRuntimeEnvironment) {
  const networkName = hre.network.name;

  return getOnChainCryptoUSDPrice(hre, constants.ETH_USD_FEED_ADDRESS[networkName]);
}

export async function getOnChainWbtcUsdPrice(hre: HardhatRuntimeEnvironment) {
  const networkName = hre.network.name;

  return getOnChainCryptoUSDPrice(hre, constants.BTC_USD_FEED_ADDRESS[networkName]);
}

export async function getOnChainCryptoUSDPrice(hre: HardhatRuntimeEnvironment, cryptoUsdFeedAddress: string) {
  const cryptoUsdFeed = (await hre.ethers.getContractAt("AggregatorV3Interface", formatAddress(hre, cryptoUsdFeedAddress))) as AggregatorV3Interface;
  const crypto_usd_data = await cryptoUsdFeed.latestRoundData();
  const price_crypto_usd_decimlas = await cryptoUsdFeed.decimals();
  return bigNumberToDecimal(crypto_usd_data.answer, price_crypto_usd_decimlas);
}

export async function getOnChainCryptoFiatPrice(hre: HardhatRuntimeEnvironment, fiat_usd_feed_addres: string, crypto_usd_feed_address: string) {
  const fiat_usd_feed = (await hre.ethers.getContractAt("AggregatorV3Interface", formatAddress(hre, fiat_usd_feed_addres))) as AggregatorV3Interface;

  const fiat_usd_data = await fiat_usd_feed.latestRoundData();
  const price_fiat_usd_decimlas = await fiat_usd_feed.decimals();
  const price_fiat_usd = bigNumberToDecimal(fiat_usd_data.answer, price_fiat_usd_decimlas);

  const price_crypto_usd = await getOnChainCryptoUSDPrice(hre, crypto_usd_feed_address);

  const cryptoInFiatPrice = price_crypto_usd / price_fiat_usd;
  const cryptoInFiatPrice_1e12 = to_d12(cryptoInFiatPrice);

  return { price_1e12: cryptoInFiatPrice_1e12, price: cryptoInFiatPrice };
}

export async function getUniswapPair(hre: HardhatRuntimeEnvironment, tokenA: IERC20, tokenB: IERC20) {
  const factory = await getUniswapFactory(hre);
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
  const pair = (await hre.ethers.getContractAt("UniswapV2Pair", formatAddress(hre, pairAddress))) as UniswapV2Pair;

  return pair;
}

export async function getWethPair(hre: HardhatRuntimeEnvironment, tokenName: string): Promise<UniswapV2Pair> {
  const deployer = await getDeployer(hre);
  const uniswapFactory = (await hre.ethers.getContract("UniswapV2Factory", deployer)) as UniswapV2Factory;

  const token = (await hre.ethers.getContract(tokenName)) as BDStable;

  const pairAddress = await uniswapFactory.getPair(token.address, constants.wETH_address[hre.network.name]);

  const pair = (await hre.ethers.getContractAt("UniswapV2Pair", formatAddress(hre, pairAddress))) as UniswapV2Pair;

  return pair;
}

export async function getWethPairOracle(hre: HardhatRuntimeEnvironment, tokenName: string): Promise<UniswapPairOracle> {
  return getUniswapPairOracle(hre, tokenName, "WETH");
}

export function getWbtcPairOracle(hre: HardhatRuntimeEnvironment, tokenName: string): Promise<UniswapPairOracle> {
  return getUniswapPairOracle(hre, tokenName, "WBTC");
}

export async function getUniswapPairOracle(hre: HardhatRuntimeEnvironment, tokenAName: string, tokenBName: string): Promise<UniswapPairOracle> {
  const deployer = await getDeployer(hre);

  const tokenAAddress = await getContratAddress(hre, tokenAName);
  const tokenBAddress = await getContratAddress(hre, tokenBName);

  const poolKey = getPoolKey(tokenAAddress, tokenBAddress, tokenAName, tokenBName);

  const oracle = (await hre.ethers.getContract(`UniswapPairOracle_${poolKey}`, deployer)) as UniswapPairOracle;

  return oracle;
}

export async function getContratAddress(hre: HardhatRuntimeEnvironment, contractName: string) {
  if (contractName === "WETH") {
    return constants.wETH_address[hre.network.name];
  } else if (contractName === "WBTC") {
    return constants.wBTC_address[hre.network.name];
  } else {
    return (await hre.ethers.getContract(contractName)).address;
  }
}

export async function getUpdater(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract("UpdaterRSK", deployer)) as UpdaterRSK;
}

// This is used to convert address string to a value suppored by particular network
// Where to we need a formatted address?
// NOT when address is contract function parameter
// NOT when address is deployment parameter (constructor or initializer parameters array)
// YES when we call hre.ethers.getContractAt(...)
export function formatAddress(hre: HardhatRuntimeEnvironment, address: string) {
  if (hre.network.name == "rsk") {
    return address.toLowerCase();
  }

  return address;
}

async function getBDStable(hre: HardhatRuntimeEnvironment, symbol: string) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract(symbol, deployer)) as BDStable;
}
