import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BDStable } from "../../typechain/BDStable";
import { ChainlinkBasedCryptoFiatFeed } from "../../typechain/ChainlinkBasedCryptoFiatFeed";

export async function getBdEur(hre: HardhatRuntimeEnvironment){
  const [ ownerUser ] = await hre.ethers.getSigners();
  return await hre.ethers.getContract('BDEUR', ownerUser) as unknown as BDStable;
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