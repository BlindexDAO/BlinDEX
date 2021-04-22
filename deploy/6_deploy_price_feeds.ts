import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { BigNumber } from 'ethers';
import { ChainlinkBasedCryptoFiatFeed } from '../typechain/ChainlinkBasedCryptoFiatFeed';
import { isAddress } from 'ethers/lib/utils';
import { BDXShares } from '../typechain/BDXShares';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import { UniswapPairOracle } from '../typechain/UniswapPairOracle';
import * as constants from '../utils/Constatnts'
import { BDStable } from '../typechain/BDStable';

async function deployUniswapOracle(hre: HardhatRuntimeEnvironment, tokenAddress: string, tokenName: string) : Promise<UniswapPairOracle> {
  const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as unknown as UniswapV2Factory;
  
  const pairAddress = await uniswapFactoryContract.getPair(tokenAddress, constants.wETH_address); 

  await hre.deployments.deploy('UniswapPairOracle_BDX_WETH', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "UniswapPairOracle",
    args: [
      pairAddress,
      tokenAddress,
      constants.wETH_address,
      (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
      hre.ethers.constants.AddressZero, //todo ag use actual contract
    ]
  });

  const oracle = await hre.ethers.getContract(`UniswapPairOracle_${tokenName}_WETH`) as unknown as UniswapPairOracle;

  console.log(`Deplyed ${tokenName} WETH Uniswap oracle`);

  return oracle;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.ethers.getSigners();

  await hre.deployments.deploy('ChainlinkBasedCryptoFiatFeed_WETH_EUR', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "ChainlinkBasedCryptoFiatFeed",
    args: [constants.EUR_USD_CHAINLINK_FEED, constants.WETH_USD_CHAINLINK_FEED]
  });

  const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract("ChainlinkBasedCryptoFiatFeed_WETH_EUR") as unknown as ChainlinkBasedCryptoFiatFeed;

  console.log("ChainlinkBasedCryptoFiatFeed_WETH_EUR deployed to:", chainlinkBasedCryptoFiatFeed_ETH_EUR.address);

  // UniswapPairOracles

  const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;
  const bdeur = await hre.ethers.getContract("BDEUR") as unknown as BDStable;

  const bdxWethOracle = await deployUniswapOracle(hre, bdx.address, "BDXShares");
  bdeur.setBDX_WETH_Oracle(bdxWethOracle);
  console.log(`Added BDX WETH Uniswap oracle`);

  const bdeurWethOracle = await deployUniswapOracle(hre, bdx.address, "BDEUR");
  bdeur.setBDStable_WETH_Oracle(bdeurWethOracle);
  console.log(`Added BDEUR WETH Uniswap oracle`);

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['PriceFeeds'];
func.dependencies = ['StakingRewards'];
export default func;