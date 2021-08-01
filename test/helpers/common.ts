import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BDStable } from "../../typechain/BDStable";
import { BdStablePool } from "../../typechain/BdStablePool";
import { BDXShares } from "../../typechain/BDXShares";
import { ChainlinkBasedCryptoFiatFeed } from "../../typechain/ChainlinkBasedCryptoFiatFeed";
import { ERC20 } from "../../typechain/ERC20";
import { UniswapV2Router02__factory } from "../../typechain/factories/UniswapV2Router02__factory";
import { UniswapV2Factory } from "../../typechain/UniswapV2Factory";
import { UniswapV2Pair } from "../../typechain/UniswapV2Pair";
import { UniswapV2Router02 } from "../../typechain/UniswapV2Router02";
import { BigNumber } from '@ethersproject/bignumber';
import * as constants from '../../utils/Constants'

export async function getDeployer(hre: HardhatRuntimeEnvironment) {
  const deployer = await hre.ethers.getNamedSigner('DEPLOYER_ADDRESS');
  return deployer;
}

export async function getUser(hre: HardhatRuntimeEnvironment) {
  const user = await hre.ethers.getNamedSigner('TEST2');
  return user;
}

export async function getBdEur(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDEUR', ownerUser) as BDStable;
}

export async function getUniswapRouter(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('UniswapV2Router02', ownerUser) as UniswapV2Router02;
}

export async function getUniswapFactory(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('UniswapV2Factory', ownerUser) as UniswapV2Factory;
}

export async function getBdEurWethPool(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as BdStablePool;
}

export async function getBdEurWbtcPool(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDEUR_WBTC_POOL', ownerUser) as BdStablePool;
}

export async function getBdx(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDXShares', ownerUser) as BDXShares;
}

export async function getWeth(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as ERC20;
}

export async function getWbtc(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContractAt("ERC20", constants.wBTC_address[hre.network.name], ownerUser) as ERC20;
}

export async function mintWbtc(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, amount_in_eth_d18: BigNumber){
  const uniRouter = UniswapV2Router02__factory.connect(constants.uniswapRouterAddress, user)
  const networkName = hre.network.name;

  await uniRouter.swapExactETHForTokens(0, [constants.wETH_address[networkName], constants.wBTC_address[networkName]], user.address,  Date.now() + 3600, {
    value: amount_in_eth_d18
  })
}

export async function getOnChainEthEurPrice(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);

  const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract(
      'ChainlinkBasedCryptoFiatFeed_WETH_EUR', 
      ownerUser) as ChainlinkBasedCryptoFiatFeed;
  
  const ethInEurPrice_1e12 = await chainlinkBasedCryptoFiatFeed_ETH_EUR.getPrice_1e12();
  const ethInEurPrice = ethInEurPrice_1e12.div(1e12).toNumber();

  return {ethInEurPrice_1e12, ethInEurPrice};
}

export async function getOnChainBtcEurPrice(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);

  const chainlinkBasedCryptoFiatFeed_BTC_EUR = await hre.ethers.getContract(
      'ChainlinkBasedCryptoFiatFeed_WBTC_EUR', 
      ownerUser) as ChainlinkBasedCryptoFiatFeed;
  
  const btcInEurPrice_1e12 = await chainlinkBasedCryptoFiatFeed_BTC_EUR.getPrice_1e12();
  const btcInEurPrice = btcInEurPrice_1e12.div(1e12).toNumber();

  return {btcInEurPrice_1e12, btcInEurPrice};
}

export async function getUniswapPair(hre: HardhatRuntimeEnvironment, tokenA: ERC20, tokenB: ERC20) {
  const factory = await getUniswapFactory(hre);
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
  const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;
  return pair;
}