import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { BigNumber } from 'ethers';
import { ChainlinkBasedCryptoFiatFeed } from '../typechain/ChainlinkBasedCryptoFiatFeed';

const EUR_USD_CHAINLINK_FEED = "0xb49f677943BC038e9857d61E7d053CaA2C1734C1";
const ETH_USD_CHAINLINK_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const BTC_USD_CHAINLINK_FEED = "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.ethers.getSigners();

  await hre.deployments.deploy('ChainlinkBasedCryptoFiatFeed_ETH_EUR', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "ChainlinkBasedCryptoFiatFeed",
    args: [EUR_USD_CHAINLINK_FEED, ETH_USD_CHAINLINK_FEED]
  });

  const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract("ChainlinkBasedCryptoFiatFeed_ETH_EUR") as unknown as ChainlinkBasedCryptoFiatFeed;

  console.log("ChainlinkBasedCryptoFiatFeed_ETH_EUR deployed to:", chainlinkBasedCryptoFiatFeed_ETH_EUR.address);

  await hre.deployments.deploy('ChainlinkBasedCryptoFiatFeed_BTC_EUR', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "ChainlinkBasedCryptoFiatFeed",
    args: [EUR_USD_CHAINLINK_FEED, BTC_USD_CHAINLINK_FEED]
  });

  const chainlinkBasedCryptoFiatFeed_BTC_EUR = await hre.ethers.getContract("ChainlinkBasedCryptoFiatFeed_BTC_EUR") as unknown as ChainlinkBasedCryptoFiatFeed;

  console.log("ChainlinkBasedCryptoFiatFeed_BTC_EUR deployed to:", chainlinkBasedCryptoFiatFeed_BTC_EUR.address);

	// One time migration
	return true;
};
func.id = __filename
export default func;