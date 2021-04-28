import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { ChainlinkBasedCryptoFiatFeed } from '../typechain/ChainlinkBasedCryptoFiatFeed';
import * as constants from '../utils/Constatnts'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {

  const [ deployer ] = await hre.ethers.getSigners();

  await hre.deployments.deploy('ChainlinkBasedCryptoFiatFeed_WETH_EUR', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "ChainlinkBasedCryptoFiatFeed",
    args: [constants.EUR_USD_CHAINLINK_FEED, constants.WETH_USD_CHAINLINK_FEED]
  });

  const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract("ChainlinkBasedCryptoFiatFeed_WETH_EUR") as unknown as ChainlinkBasedCryptoFiatFeed;

  console.log("ChainlinkBasedCryptoFiatFeed_WETH_EUR deployed to:", chainlinkBasedCryptoFiatFeed_ETH_EUR.address);

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['PriceFeeds'];
func.dependencies = ['StakingRewards'];
export default func;