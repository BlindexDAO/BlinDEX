import { BigNumber } from "ethers";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BDStable } from "../../typechain/BDStable";
import { BdStablePool } from "../../typechain/BdStablePool";
import { BDXShares } from "../../typechain/BDXShares";
import { ChainlinkBasedCryptoFiatFeed } from "../../typechain/ChainlinkBasedCryptoFiatFeed";
import { ERC20 } from "../../typechain/ERC20";
import { UniswapV2Router02__factory } from "../../typechain/factories/UniswapV2Router02__factory";
import { UniswapV2Factory } from "../../typechain/UniswapV2Factory";
import { UniswapV2Router02 } from "../../typechain/UniswapV2Router02";
import { WETH } from "../../typechain/WETH";
import * as constants from '../../utils/Constants'

export async function getDeployer(hre: HardhatRuntimeEnvironment) {
  const deployer = await hre.ethers.getNamedSigner('DEPLOYER_ADDRESS');
  return deployer;
}

export async function getBdEur(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDEUR', ownerUser) as unknown as BDStable;
}

export async function getUniswapRouter(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('UniswapV2Router02', ownerUser) as unknown as UniswapV2Router02;
}

export async function getUniswapFactory(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('UniswapV2Factory', ownerUser) as unknown as UniswapV2Factory;
}

export async function getBdEurWethPool(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;
}

export async function getBdEurWbtcPool(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDEUR_WBTC_POOL', ownerUser) as unknown as BdStablePool;
}

export async function getBdx(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContract('BDXShares', ownerUser) as unknown as BDXShares;
}

export async function getWeth(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as unknown as ERC20;
}

export async function getWbtc(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);
  return await hre.ethers.getContractAt("ERC20", constants.wBTC_address[hre.network.name], ownerUser) as unknown as ERC20;
}

export async function getOnChainEthEurPrice(hre: HardhatRuntimeEnvironment){
  const ownerUser = await getDeployer(hre);

  const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract(
      'ChainlinkBasedCryptoFiatFeed_WETH_EUR', 
      ownerUser) as unknown as ChainlinkBasedCryptoFiatFeed;
  
  const ethInEurPrice_1e12 = await chainlinkBasedCryptoFiatFeed_ETH_EUR.getPrice_1e12();
  const ethInEurPrice = ethInEurPrice_1e12.div(1e12).toNumber();

  return {ethInEurPrice_1e12, ethInEurPrice};
}

export async function swapEthForWbtc(hre: HardhatRuntimeEnvironment, account: SignerWithAddress, amountETH: BigNumber){
  // swaps ETH for WETH internally
  
  const uniRouter = UniswapV2Router02__factory.connect(constants.uniswapRouterAddress, account)
  await uniRouter.connect(account).swapExactETHForTokens(0, [constants.wETH_address[hre.network.name], constants.wBTC_address[hre.network.name]], account.address,  Date.now() + 3600, {
    value: amountETH
  })
}