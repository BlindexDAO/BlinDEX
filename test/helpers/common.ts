import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BDStable } from "../../typechain/BDStable";
import { BdStablePool } from "../../typechain/BdStablePool";
import { BDXShares } from "../../typechain/BDXShares";
import { AggregatorV3Interface } from "../../typechain/AggregatorV3Interface";
import { ERC20 } from "../../typechain/ERC20";
import { UniswapV2Router02__factory } from "../../typechain/factories/UniswapV2Router02__factory";
import { UniswapV2Factory } from "../../typechain/UniswapV2Factory";
import { UniswapV2Pair } from "../../typechain/UniswapV2Pair";
import { UniswapV2Router02 } from "../../typechain/UniswapV2Router02";
import { BigNumber } from '@ethersproject/bignumber';
import * as constants from '../../utils/Constants'
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { bigNumberToDecimal, to_d12 } from "../../utils/Helpers";
import { BDLens } from "../../typechain/BDLens";

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
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDEU', ownerUser) as BDStable;
}

export async function getUniswapRouter(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('UniswapV2Router02', ownerUser) as UniswapV2Router02;
}

export async function getUniswapFactory(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('UniswapV2Factory', ownerUser) as UniswapV2Factory;
}

export async function getBdEuWethPool(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDEU_WETH_POOL', ownerUser) as BdStablePool;
}

export async function getBdEuWbtcPool(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDEU_WBTC_POOL', ownerUser) as BdStablePool;
}

export async function getBdx(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDXShares', ownerUser) as BDXShares;
}

export async function getWeth(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as ERC20;
}

export async function getBdLens(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract("BDLens", ownerUser) as BDLens;
}

export async function getWbtc(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContractAt("ERC20", constants.wBTC_address[hre.network.name], ownerUser) as ERC20;
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

export async function getUniswapPair(hre: HardhatRuntimeEnvironment, tokenA: ERC20, tokenB: ERC20) {
  const factory = await getUniswapFactory(hre);
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
  const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;

  return pair;
}