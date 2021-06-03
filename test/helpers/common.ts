import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BDStable } from "../../typechain/BDStable";
import { BdStablePool } from "../../typechain/BdStablePool";
import { BDXShares } from "../../typechain/BDXShares";
import { ChainlinkBasedCryptoFiatFeed } from "../../typechain/ChainlinkBasedCryptoFiatFeed";
import { WETH } from "../../typechain/WETH";
import * as constants from '../../utils/Constants'

export async function getBdEur(hre: HardhatRuntimeEnvironment){
  const [ ownerUser ] = await hre.ethers.getSigners();
  return await hre.ethers.getContract('BDEUR', ownerUser) as unknown as BDStable;
}

export async function getBdEurPool(hre: HardhatRuntimeEnvironment){
  const [ ownerUser ] = await hre.ethers.getSigners();
  return await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;
}

export async function getBdx(hre: HardhatRuntimeEnvironment){
  const [ ownerUser ] = await hre.ethers.getSigners();
  return await hre.ethers.getContract('BDXShares', ownerUser) as unknown as BDXShares;
}

export async function getWeth(hre: HardhatRuntimeEnvironment){
  const [ ownerUser ] = await hre.ethers.getSigners();
  return await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as unknown as WETH;
}

export async function getOnChainEthEurPrice(hre: HardhatRuntimeEnvironment){
  const [ ownerUser ] = await hre.ethers.getSigners();

  const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract(
      'ChainlinkBasedCryptoFiatFeed_WETH_EUR', 
      ownerUser) as unknown as ChainlinkBasedCryptoFiatFeed;
  
  const ethInEurPrice_1e12 = await chainlinkBasedCryptoFiatFeed_ETH_EUR.getPrice_1e12();
  const ethInEurPrice = ethInEurPrice_1e12.div(1e12).toNumber();

  return {ethInEurPrice_1e12, ethInEurPrice};
}