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
import { PriceFeedContractNames } from "../deploy/7_deploy_price_feeds";
import type { SovrynSwapPriceFeed } from "../typechain/SovrynSwapPriceFeed";
import type { FiatToFiatPseudoOracleFeed } from "../typechain/FiatToFiatPseudoOracleFeed";
import { wBTC_address, wETH_address, EXTERNAL_USD_STABLE } from "./Constants";

interface BDStableContractDetail {
  [key: string]: {
    symbol: string;
    name: string;
    fiat: string;
    ehereumChainlinkPriceFeed?: string;
    pools: {
      weth: { name: string };
      wbtc: { name: string };
    };
  };
}

function prepareBDStablesContractsDetails() {
  const bdstablesDetails = [
    {
      symbol: "BDEU",
      name: "Blindex Euro",
      fiat: "EUR",
      ehereumChainlinkPriceFeed: "0xb49f677943BC038e9857d61E7d053CaA2C1734C1"
    },
    {
      symbol: "BDUS",
      name: "Blindex USD",
      fiat: "USD"
    },
    {
      symbol: "bXAU",
      name: "Blindex Gold",
      fiat: "XAU",
      ehereumChainlinkPriceFeed: "0x214ed9da11d2fbe465a6fc601a91e62ebec1a0d6"
    },
    {
      symbol: "bGBP",
      name: "Blindex GBP",
      fiat: "GBP",
      ehereumChainlinkPriceFeed: "0x5c0ab2d9b5a7ed9f470386e82bb36a3613cdd4b5"
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

export function getOperationalTreasury(hre: HardhatRuntimeEnvironment): Promise<SignerWithAddress> {
  return hre.ethers.getNamedSigner("OPERATIONAL_TREASURY");
}

export async function getUser(hre: HardhatRuntimeEnvironment): Promise<SignerWithAddress> {
  const user = await hre.ethers.getNamedSigner("TEST2");
  return user;
}

export async function getTreasury(hre: HardhatRuntimeEnvironment): Promise<SignerWithAddress> {
  const user = await hre.ethers.getNamedSigner("TREASURY");
  return user;
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
  return await getBDStableCollateralStakingRewards(hre, symbol, "WETH");
}

export async function getStakingRewardsWithWbtc(hre: HardhatRuntimeEnvironment, symbol: string): Promise<StakingRewards | null> {
  return await getBDStableCollateralStakingRewards(hre, symbol, "WBTC");
}

export async function getStakingRewardsWithBdx(hre: HardhatRuntimeEnvironment, symbol: string): Promise<StakingRewards | null> {
  return await getBDStableCollateralStakingRewards(hre, symbol, "BDX");
}

async function getBDStableCollateralStakingRewards(
  hre: HardhatRuntimeEnvironment,
  stableSymbol: string,
  collateralSymbol: string
): Promise<StakingRewards | null> {
  const collateralAddress = await getContratAddress(hre, collateralSymbol);
  const stableAddress = await getContratAddress(hre, stableSymbol);
  const poolKey = getPoolKey(collateralAddress, stableAddress, collateralSymbol, stableSymbol);

  const deployer = await getDeployer(hre);
  const stakingRewardsContract = await hre.ethers.getContractOrNull(`StakingRewards_${poolKey}`, deployer);
  return stakingRewardsContract && (stakingRewardsContract as StakingRewards);
}

export async function getAllBDStableStakingRewards(hre: HardhatRuntimeEnvironment): Promise<StakingRewards[]> {
  const deployer = await getDeployer(hre);
  const bdstablesSymbols = getAllBDStablesSymbols();
  const bdx = await getBdx(hre);
  const stakingRewards: StakingRewards[] = [];
  const stakingRewardsBdStablesMap = new Set<string>();

  const bdxWethStakingRewards = await getStakingRewardsWithWeth(hre, await bdx.symbol());
  if (!bdxWethStakingRewards) {
    throw new Error("BDX-WETH staking reward is missing");
  }
  stakingRewards.push(bdxWethStakingRewards);

  const bdxWbtcStakingRewards = await getStakingRewardsWithWbtc(hre, await bdx.symbol());
  if (!bdxWbtcStakingRewards) {
    throw new Error("BDX-WBTC staking reward is missing");
  }
  stakingRewards.push(bdxWbtcStakingRewards);

  for (const symbolA of bdstablesSymbols) {
    const wethStakingRewards = await getStakingRewardsWithWeth(hre, symbolA);
    if (wethStakingRewards) {
      stakingRewards.push(wethStakingRewards);
    }

    const wbtcStakingRewards = await getStakingRewardsWithWbtc(hre, symbolA);
    if (wbtcStakingRewards) {
      stakingRewards.push(wbtcStakingRewards);
    }

    const bdxStakingRewards = await getStakingRewardsWithBdx(hre, symbolA);
    if (bdxStakingRewards) {
      stakingRewards.push(bdxStakingRewards);
    }

    for (const symbolB of bdstablesSymbols) {
      const stableAddress = await getContratAddress(hre, symbolA);
      const stableBAddress = await getContratAddress(hre, symbolB);
      const poolKey = getPoolKey(stableBAddress, stableAddress, symbolB, symbolA);

      // Do not repeat the same staking rewards twice
      if (symbolA !== symbolB && !stakingRewardsBdStablesMap.has(poolKey)) {
        const stablesStakingRewards = await hre.ethers.getContractOrNull(`StakingRewards_${poolKey}`, deployer);
        if (stablesStakingRewards) {
          stakingRewards.push(stablesStakingRewards as StakingRewards);
          stakingRewardsBdStablesMap.add(poolKey);
        }
      }
    }
  }

  const bdus = await getBdUs(hre);
  const externalUsdStable = EXTERNAL_USD_STABLE[hre.network.name];
  const poolKey = getPoolKey(bdus.address, externalUsdStable.address, await bdus.symbol(), externalUsdStable.symbol);
  const bdusExternalUsdStableStakingRewards = await hre.ethers.getContract(`StakingRewards_${poolKey}`, deployer);
  if (!bdusExternalUsdStableStakingRewards) {
    throw new Error(`Couldn't find ${poolKey} staking rewards contract`);
  }
  stakingRewards.push(bdusExternalUsdStableStakingRewards as StakingRewards);
  stakingRewardsBdStablesMap.add(poolKey);

  return stakingRewards;
}

export function getBDStableFiat(symbol: string): string {
  return bdStablesContractsDetails[symbol].fiat;
}

export function getBDStableChainlinkPriceFeed(symbol: string): string | undefined {
  return bdStablesContractsDetails[symbol].ehereumChainlinkPriceFeed;
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

export async function getContratAddress(hre: HardhatRuntimeEnvironment, contractName: string) {
  if (contractName === "WETH") {
    return constants.wETH_address[hre.network.name];
  } else if (contractName === "WBTC") {
    return constants.wBTC_address[hre.network.name];
  } else if (contractName === EXTERNAL_USD_STABLE[hre.network.name].symbol) {
    return EXTERNAL_USD_STABLE[hre.network.name].address;
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
