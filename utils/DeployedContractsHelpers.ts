import { IERC20 } from '../typechain/IERC20';
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BDStable } from "../typechain/BDStable";
import { BdStablePool } from "../typechain/BdStablePool";
import { BDXShares } from "../typechain/BDXShares";
import { AggregatorV3Interface } from "../typechain/AggregatorV3Interface";
import { ERC20 } from "../typechain/ERC20";
import { UniswapV2Router02__factory } from "../typechain/factories/UniswapV2Router02__factory";
import { UniswapV2Factory } from "../typechain/UniswapV2Factory";
import { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { UniswapV2Router02 } from "../typechain/UniswapV2Router02";
import { BigNumber } from '@ethersproject/bignumber';
import * as constants from './Constants'
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { bigNumberToDecimal, to_d12 } from "./NumbersHelpers";
import { StakingRewardsDistribution } from "../typechain/StakingRewardsDistribution";
import { Vesting } from "../typechain/Vesting";
import { WETH } from "../typechain/WETH";
import { UniswapPairOracle } from "../typechain/UniswapPairOracle";

export async function getDeployer(hre: HardhatRuntimeEnvironment) {
  const deployer = await hre.ethers.getNamedSigner('DEPLOYER');
  return deployer;
}

export async function getUser(hre: HardhatRuntimeEnvironment): Promise<SignerWithAddress> {
  const user = await hre.ethers.getNamedSigner('TEST2');
  return user;
}

export async function getTreasury(hre: HardhatRuntimeEnvironment): Promise<SignerWithAddress> {
  const user = await hre.ethers.getNamedSigner('TREASURY');
  return user;
}

export async function getBdEu(hre: HardhatRuntimeEnvironment){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContract('BDEU', deployer) as BDStable;
}

export async function getUniswapRouter(hre: HardhatRuntimeEnvironment){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContract('UniswapV2Router02', deployer) as UniswapV2Router02;
}

export async function getUniswapFactory(hre: HardhatRuntimeEnvironment){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContract('UniswapV2Factory', deployer) as UniswapV2Factory;
}

export async function getStakingRewardsDistribution(hre: HardhatRuntimeEnvironment){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContract('StakingRewardsDistribution', deployer) as StakingRewardsDistribution;
}

export async function getVesting(hre: HardhatRuntimeEnvironment){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContract('Vesting', deployer) as Vesting;
}

export async function getBdEuWethPool(hre: HardhatRuntimeEnvironment){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContract('BDEU_WETH_POOL', deployer) as BdStablePool;
}

export async function getBdEuWbtcPool(hre: HardhatRuntimeEnvironment){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContract('BDEU_WBTC_POOL', deployer) as BdStablePool;
}

export async function getBdx(hre: HardhatRuntimeEnvironment){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContract('BDX', deployer) as BDXShares;
}

export async function getWeth(hre: HardhatRuntimeEnvironment){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], deployer) as WETH;
}

export async function getWbtc(hre: HardhatRuntimeEnvironment){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContractAt("ERC20", constants.wBTC_address[hre.network.name], deployer) as ERC20;
}

export async function getIERC20(hre: HardhatRuntimeEnvironment, address: string){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContractAt("IERC20", address, deployer) as IERC20;
}

export async function getERC20(hre: HardhatRuntimeEnvironment, address: string){
  const deployer = await getDeployer(hre);
  return await hre.ethers.getContractAt("ERC20", address, deployer) as ERC20;
}

export async function mintWbtc(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, amount_in_eth_d18: BigNumber){
  const uniRouter = UniswapV2Router02__factory.connect(constants.uniswapRouterAddress, user)
  const networkName = hre.network.name;

  await(await uniRouter.swapExactETHForTokens(0, [constants.wETH_address[networkName], constants.wBTC_address[networkName]], user.address,  Date.now() + 3600, {
    value: amount_in_eth_d18
  })).wait();
}

export async function getOnChainBtcEurPrice(hre: HardhatRuntimeEnvironment){
  const networkName = hre.network.name;

  return getOnChainCryptoFiatPrice(
    hre,
    constants.EUR_USD_FEED_ADDRESS[networkName],
    constants.BTC_USD_FEED_ADDRESS[networkName])
}

export async function getOnChainEthEurPrice(hre: HardhatRuntimeEnvironment){
  const networkName = hre.network.name;

  return getOnChainCryptoFiatPrice(
    hre,
    constants.EUR_USD_FEED_ADDRESS[networkName],
    constants.ETH_USD_FEED_ADDRESS[networkName])
}

export async function getOnChainCryptoFiatPrice(
  hre: HardhatRuntimeEnvironment,
  fiat_usd_feed_addres: string,
  crypto_usd_feed_address: string)
{
  const fiat_usd_feed = await hre.ethers.getContractAt('AggregatorV3Interface', fiat_usd_feed_addres) as AggregatorV3Interface;
  const crypto_usd_feed = await hre.ethers.getContractAt('AggregatorV3Interface', crypto_usd_feed_address) as AggregatorV3Interface;
  
  const fiat_usd_data = await fiat_usd_feed.latestRoundData();
  const price_fiat_usd_decimlas = await fiat_usd_feed.decimals();
  const price_fiat_usd = bigNumberToDecimal(fiat_usd_data.answer, price_fiat_usd_decimlas);

  const crypto_usd_data = await crypto_usd_feed.latestRoundData();
  const price_crypto_usd_decimlas = await crypto_usd_feed.decimals();
  const price_crypto_usd = bigNumberToDecimal(crypto_usd_data.answer, price_crypto_usd_decimlas);

  const cryptoInFiatPrice = price_crypto_usd / price_fiat_usd;
  const cryptoInFiatPrice_1e12 = to_d12(cryptoInFiatPrice);

  return {price_1e12: cryptoInFiatPrice_1e12, price: cryptoInFiatPrice};
}

export async function getUniswapPair(hre: HardhatRuntimeEnvironment, tokenA: IERC20, tokenB: IERC20) {
  const factory = await getUniswapFactory(hre);
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
  const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;

  return pair;
}

export async function getWethPair(hre: HardhatRuntimeEnvironment, tokenName: string): Promise<UniswapV2Pair> {
  const deployer = await getDeployer(hre);
  const uniswapFactory = await hre.ethers.getContract("UniswapV2Factory", deployer) as UniswapV2Factory;

  const token = await hre.ethers.getContract(tokenName) as BDStable;

  const pairAddress = await uniswapFactory.getPair(token.address, constants.wETH_address[hre.network.name]);

  const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;

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
  const oracle = await hre.ethers.getContract(`UniswapPairOracle_${tokenAName}_${tokenBName}`, deployer) as UniswapPairOracle;

  return oracle;
}