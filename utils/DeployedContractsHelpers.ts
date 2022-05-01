import _ from "lodash";
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
import { getPoolKey } from "./UniswapPoolsHelpers";
import type { StakingRewards } from "../typechain/StakingRewards";
import type { UpdaterRSK } from "../typechain/UpdaterRSK";
import type { SovrynSwapPriceFeed } from "../typechain/SovrynSwapPriceFeed";
import type { FiatToFiatPseudoOracleFeed } from "../typechain/FiatToFiatPseudoOracleFeed";
import { wBTC_address, wETH_address, PriceFeedContractNames, getListOfSupportedLiquidityPools } from "./Constants";

interface BDStableContractDetail {
  [key: string]: {
    symbol: string;
    name: string;
    fiat: string;
    fiatSymbol: string;
    ethereumChainlinkPriceFeed?: string;
    pools: {
      weth: { name: string };
      wbtc: { name: string };
    };
    isCurrency: boolean;
  };
}

function prepareBDStablesContractsDetails() {
  const bdstablesDetails = [
    {
      symbol: "BDEU",
      name: "Blindex Euro",
      fiat: "EUR",
      fiatSymbol: "€",
      ethereumChainlinkPriceFeed: "0xb49f677943BC038e9857d61E7d053CaA2C1734C1",
      isCurrency: true
    },
    {
      symbol: "BDUS",
      name: "Blindex USD",
      fiat: "USD",
      fiatSymbol: "$",
      isCurrency: true
    },
    {
      symbol: "bXAU",
      name: "Blindex Gold",
      fiat: "XAU",
      fiatSymbol: "$",
      ethereumChainlinkPriceFeed: "0x214ed9da11d2fbe465a6fc601a91e62ebec1a0d6",
      isCurrency: false
    },
    {
      symbol: "bGBP",
      name: "Blindex GBP",
      fiat: "GBP",
      fiatSymbol: "£",
      ethereumChainlinkPriceFeed: "0x5c0ab2d9b5a7ed9f470386e82bb36a3613cdd4b5",
      isCurrency: true
    }
  ];

  const stables: BDStableContractDetail = {};

  for (const bdstable of bdstablesDetails) {
    const pools = {
      weth: {
        name: `${bdstable.symbol}_WETH_POOL`
      },
      wbtc: {
        name: `${bdstable.symbol}_WBTC_POOL`
      }
    };

    stables[bdstable.symbol] = Object.assign(bdstable, { pools });
  }

  return stables;
}

export const bdStablesContractsDetails: BDStableContractDetail = prepareBDStablesContractsDetails();

export function getAllBDStablesSymbols(): string[] {
  return Object.values(bdStablesContractsDetails).map(stable => stable.symbol);
}

export function getAllBDStablesFiatSymbols(): string[] {
  return Object.values(bdStablesContractsDetails).map(stable => stable.fiat);
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

export function getDeployer(hre: HardhatRuntimeEnvironment) {
  return hre.ethers.getNamedSigner("DEPLOYER");
}

export function getBot(hre: HardhatRuntimeEnvironment) {
  return hre.ethers.getNamedSigner("BOT");
}

export function getUser(hre: HardhatRuntimeEnvironment): Promise<SignerWithAddress> {
  return hre.ethers.getNamedSigner("TEST2");
}

export function getTreasury(hre: HardhatRuntimeEnvironment): Promise<SignerWithAddress> {
  return hre.ethers.getNamedSigner("TREASURY");
}

export async function getBDStableWbtcPool(hre: HardhatRuntimeEnvironment, symbol: string): Promise<BdStablePool> {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract(bdStablesContractsDetails[symbol].pools.wbtc.name, deployer)) as BdStablePool;
}

export async function getBDStableWethPool(hre: HardhatRuntimeEnvironment, symbol: string): Promise<BdStablePool> {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract(bdStablesContractsDetails[symbol].pools.weth.name, deployer)) as BdStablePool;
}

export async function getStakingRewardsWithWeth(hre: HardhatRuntimeEnvironment, symbol: string): Promise<StakingRewards | null> {
  return await getBDStableStakingReward(hre, symbol, "WETH");
}

export async function getStakingRewardsWithWbtc(hre: HardhatRuntimeEnvironment, symbol: string): Promise<StakingRewards | null> {
  return await getBDStableStakingReward(hre, symbol, "WBTC");
}

export async function getStakingRewardsWithBdx(hre: HardhatRuntimeEnvironment, symbol: string): Promise<StakingRewards | null> {
  return await getBDStableStakingReward(hre, symbol, "BDX");
}

async function getBDStableStakingReward(hre: HardhatRuntimeEnvironment, tokenASymbol: string, tokenBSymbol: string): Promise<StakingRewards | null> {
  const tokenAAddress = await getContratAddress(hre, tokenASymbol);
  const tokenBAddress = await getContratAddress(hre, tokenBSymbol);
  const poolKey = getPoolKey(tokenAAddress, tokenBAddress, tokenASymbol, tokenBSymbol);

  const deployer = await getDeployer(hre);
  const stakingRewardsContract = await hre.ethers.getContractOrNull(`StakingRewards_${poolKey}`, deployer);
  return stakingRewardsContract && (stakingRewardsContract as StakingRewards);
}

export async function getAllBDStableStakingRewards(hre: HardhatRuntimeEnvironment): Promise<StakingRewards[]> {
  const stakingRewards: StakingRewards[] = [];
  const supportedStakingPools = getListOfSupportedLiquidityPools(hre.network.name).filter(lp => lp.hasStakingPool);

  await Promise.all(
    supportedStakingPools.map(async stakingPool => {
      const stakingReward = await getBDStableStakingReward(hre, stakingPool.tokenA, stakingPool.tokenB);
      if (!stakingReward) {
        throw new Error(`${stakingPool.tokenA}-${stakingPool.tokenB} staking reward is missing`);
      }
      stakingRewards.push(stakingReward);
    })
  );

  return stakingRewards;
}

export function getBDStableChainlinkPriceFeed(symbol: string): string | undefined {
  return bdStablesContractsDetails[symbol].ethereumChainlinkPriceFeed;
}

export async function getBdEu(hre: HardhatRuntimeEnvironment) {
  return getBDStable(hre, "BDEU");
}

export async function getBdUs(hre: HardhatRuntimeEnvironment) {
  return getBDStable(hre, "BDUS");
}

export async function getBxau(hre: HardhatRuntimeEnvironment) {
  return getBDStable(hre, "bXAU");
}

export async function getBgbp(hre: HardhatRuntimeEnvironment) {
  return getBDStable(hre, "bGBP");
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

export function getCollateralContract(hre: HardhatRuntimeEnvironment, tokenAddress: string) {
  if (wETH_address[hre.network.name] === tokenAddress) {
    return getWeth(hre);
  } else if (wBTC_address[hre.network.name] === tokenAddress) {
    return getWbtc(hre);
  } else {
    throw new Error(`Unknown token address ${tokenAddress}`);
  }
}

export async function getWeth(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContractAt("IWETH", constants.wETH_address[hre.network.name], deployer)) as IERC20;
}

export async function getWethConcrete(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContractAt("IWETH", constants.wETH_address[hre.network.name], deployer)) as IWETH;
}

export async function getWbtc(hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContractAt("ERC20", constants.wBTC_address[hre.network.name], deployer)) as ERC20;
}

export async function getIERC20(hre: HardhatRuntimeEnvironment, address: string) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContractAt("IERC20", address, deployer)) as IERC20;
}

export async function getERC20(hre: HardhatRuntimeEnvironment, address: string) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContractAt("ERC20", address, deployer)) as ERC20;
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

export async function getOnChainWbtcFiatPrice(hre: HardhatRuntimeEnvironment, stableSymbol: string) {
  return getOnChainCryptoFiatPrice(hre, stableSymbol, "BTC");
}

export async function getOnChainWethFiatPrice(hre: HardhatRuntimeEnvironment, stableSymbol: string) {
  return getOnChainCryptoFiatPrice(hre, stableSymbol, "ETH");
}

export async function getOnChainWethUsdPrice(hre: HardhatRuntimeEnvironment) {
  return getOnChainCryptoUSDPrice(hre, "ETH");
}

export async function getOnChainWbtcUsdPrice(hre: HardhatRuntimeEnvironment) {
  return getOnChainCryptoUSDPrice(hre, "BTC");
}

export async function getOnChainCryptoUSDPrice(hre: HardhatRuntimeEnvironment, cryptoSymbol: "ETH" | "BTC") {
  const networkName = hre.network.name;
  const cryptoToUsdFeedAddress = _.get(constants, [`${cryptoSymbol}_USD_FEED_ADDRESS`, networkName]);
  if (!cryptoToUsdFeedAddress) {
    throw new Error(`There is price feed address for "${cryptoSymbol}_USD_FEED_ADDRESS" on network ${networkName}`);
  }

  const cryptoUsdFeed = (await hre.ethers.getContractAt(
    "AggregatorV3Interface",
    formatAddress(hre, cryptoToUsdFeedAddress)
  )) as AggregatorV3Interface;
  const crypto_usd_data = await cryptoUsdFeed.latestRoundData();
  const price_crypto_usd_decimlas = await cryptoUsdFeed.decimals();
  return bigNumberToDecimal(crypto_usd_data.answer, price_crypto_usd_decimlas);
}

export async function getOnChainCryptoFiatPrice(hre: HardhatRuntimeEnvironment, fiatSymbol: string, cryptoSymbol: "ETH" | "BTC") {
  const networkName = hre.network.name;
  const fiatToUsdFeedAddress = _.get(constants, [`${fiatSymbol}_USD_FEED_ADDRESS`, networkName]);
  if (!fiatToUsdFeedAddress) {
    throw new Error(`There is price feed address for "${fiatSymbol}_USD_FEED_ADDRESS" on network ${networkName}`);
  }

  const fiat_usd_feed = (await hre.ethers.getContractAt("AggregatorV3Interface", formatAddress(hre, fiatToUsdFeedAddress))) as AggregatorV3Interface;

  const fiat_usd_data = await fiat_usd_feed.latestRoundData();
  const price_fiat_usd_decimlas = await fiat_usd_feed.decimals();
  const price_fiat_usd = bigNumberToDecimal(fiat_usd_data.answer, price_fiat_usd_decimlas);

  const price_crypto_usd = await getOnChainCryptoUSDPrice(hre, cryptoSymbol);

  const cryptoInFiatPrice = price_crypto_usd / price_fiat_usd;
  const cryptoInFiatPrice_1e12 = to_d12(cryptoInFiatPrice);

  return { price_1e12: cryptoInFiatPrice_1e12, price: cryptoInFiatPrice };
}

export async function getWhitelistedTokensAddresses(hre: HardhatRuntimeEnvironment): Promise<string[]> {
  const [bdx, nativeToken, secondaryCollateral, bdstables] = await Promise.all([getBdx(hre), getWeth(hre), getWbtc(hre), getAllBDStables(hre)]);

  return [bdx.address, nativeToken.address, secondaryCollateral.address, ...bdstables.map(stable => stable.address)];
}

export async function getAllUniswapPairs(hre: HardhatRuntimeEnvironment, onlyWhitelistedTokens = false): Promise<UniswapV2Pair[]> {
  const uniswapPairs: UniswapV2Pair[] = [];
  const factory = await getUniswapFactory(hre);
  const amountOfPairs = (await factory.allPairsLength()).toNumber();
  let whitelistedTokens;

  if (onlyWhitelistedTokens) {
    whitelistedTokens = await getWhitelistedTokensAddresses(hre);
  }

  for (let index = 0; index < amountOfPairs; index++) {
    const pairAddress = formatAddress(hre, await factory.allPairs(index));
    const pair = (await hre.ethers.getContractAt("UniswapV2Pair", pairAddress)) as UniswapV2Pair;
    const [token0, token1] = await Promise.all([pair.token0(), pair.token1()]);

    if (
      !whitelistedTokens ||
      (whitelistedTokens &&
        whitelistedTokens.find(tokenAddress => tokenAddress === token0) &&
        whitelistedTokens.find(tokenAddress => tokenAddress === token1))
    ) {
      uniswapPairs.push(pair);
    }
  }

  return uniswapPairs;
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

export async function getSovrynFeed_RbtcUsd(hre: HardhatRuntimeEnvironment) {
  return (await hre.ethers.getContract(PriceFeedContractNames.ETH_USD)) as SovrynSwapPriceFeed;
}

export async function getSovrynFeed_RbtcEths(hre: HardhatRuntimeEnvironment) {
  return (await hre.ethers.getContract(PriceFeedContractNames.BTC_ETH)) as SovrynSwapPriceFeed;
}

export async function getFiatToFiat_EurUsd(hre: HardhatRuntimeEnvironment) {
  return (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD)) as FiatToFiatPseudoOracleFeed;
}

export async function getUniswapPairOracle(hre: HardhatRuntimeEnvironment, tokenAName: string, tokenBName: string): Promise<UniswapPairOracle> {
  const deployer = await getDeployer(hre);

  const tokenAAddress = await getContratAddress(hre, tokenAName);
  const tokenBAddress = await getContratAddress(hre, tokenBName);

  const poolKey = getPoolKey(tokenAAddress, tokenBAddress, tokenAName, tokenBName);

  const oracle = (await hre.ethers.getContract(`UniswapPairOracle_${poolKey}`, deployer)) as UniswapPairOracle;

  return oracle;
}

export async function getContratAddress(hre: HardhatRuntimeEnvironment, contractName: string): Promise<string> {
  if (contractName === "WETH") {
    return constants.wETH_address[hre.network.name];
  } else if (contractName === "WBTC") {
    return constants.wBTC_address[hre.network.name];
  } else {
    const externalToken = constants.EXTERNAL_SUPPORTED_TOKENS.find(token => token[hre.network.name].symbol === contractName);
    if (externalToken) {
      return externalToken[hre.network.name].address;
    }
  }

  return (await hre.ethers.getContract(contractName)).address;
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
  if (hre.network.name === "rsk") {
    return address.toLowerCase();
  }

  return address;
}

async function getBDStable(hre: HardhatRuntimeEnvironment, symbol: string) {
  const deployer = await getDeployer(hre);
  return (await hre.ethers.getContract(symbol, deployer)) as BDStable;
}

export async function getTokenData(tokenAddress: string, hre: HardhatRuntimeEnvironment): Promise<{ symbol: string; decimals: number }> {
  const bdx = await getBdx(hre);
  if (tokenAddress === bdx.address) {
    const [symbol, decimals] = await Promise.all([bdx.symbol(), bdx.decimals()]);
    return {
      symbol,
      decimals
    };
  } else if (tokenAddress === constants.wETH_address[hre.network.name]) {
    return {
      symbol: constants.NATIVE_TOKEN_NAME[hre.network.name],
      decimals: constants.wETH_precision[hre.network.name]
    };
  } else if (tokenAddress === constants.wBTC_address[hre.network.name]) {
    return {
      symbol: constants.SECONDARY_COLLATERAL_TOKEN_NAME[hre.network.name],
      decimals: constants.wBTC_precision[hre.network.name]
    };
  } else {
    const token = await getERC20(hre, tokenAddress);
    const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
    return {
      symbol,
      decimals
    };
  }
}

export async function getStakingRewardsCount(hre: HardhatRuntimeEnvironment): Promise<number> {
  const srd = await getStakingRewardsDistribution(hre);

  let poolsCount = 0;
  let noMorePools = false;
  while (!noMorePools) {
    try {
      await srd.stakingRewardsAddresses(poolsCount);
      poolsCount++;
    } catch {
      noMorePools = true;
    }
  }
  return poolsCount;
}
