import { BDXShares } from './../typechain/BDXShares.d';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ChainlinkBasedCryptoFiatFeed } from '../typechain/ChainlinkBasedCryptoFiatFeed';
import * as constants from '../utils/Constants'
import { getWethPair } from '../utils/Swaps'
import { BDStable } from '../typechain/BDStable';
import { BdStablePool } from '../typechain/BdStablePool';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkName = hre.network.name;

  const weth_eur_oracle = await hre.deployments.deploy('ChainlinkBasedCryptoFiatFeed_WETH_EUR', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "ChainlinkBasedCryptoFiatFeed",
    args: [constants.EUR_USD_CHAINLINK_FEED[networkName], constants.WETH_USD_CHAINLINK_FEED[networkName]]
  });

  const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract("ChainlinkBasedCryptoFiatFeed_WETH_EUR") as ChainlinkBasedCryptoFiatFeed;

  console.log("ChainlinkBasedCryptoFiatFeed_WETH_EUR deployed to:", chainlinkBasedCryptoFiatFeed_ETH_EUR.address);

  const wbtc_eur_oracle = await hre.deployments.deploy('ChainlinkBasedCryptoFiatFeed_WBTC_EUR', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "ChainlinkBasedCryptoFiatFeed",
    args: [constants.EUR_USD_CHAINLINK_FEED[networkName], constants.WBTC_USD_CHAINLINK_FEED[networkName]]
  });

  console.log("ChainlinkBasedCryptoFiatFeed_WETH_EUR deployed to:", chainlinkBasedCryptoFiatFeed_ETH_EUR.address);

  const bdeu = await hre.ethers.getContract("BDEU") as BDStable;
  const bdx = await hre.ethers.getContract("BDXShares") as BDXShares;

  await bdeu.setETH_fiat_Oracle(chainlinkBasedCryptoFiatFeed_ETH_EUR.address);
  console.log(`Added WETH EUR oracle to BDEU`)

  const bdxWethOracle = await getWethPair(hre,"BDXShares");
  await bdeu.setBDX_WETH_Oracle(bdxWethOracle.address, constants.wETH_address[networkName]);
  console.log(`Added BDX WETH Uniswap oracle`);

  const bdeuWethOracle = await getWethPair(hre,"BDEU");
  await bdeu.setBDStable_WETH_Oracle(bdeuWethOracle.address, constants.wETH_address[networkName]);
  console.log(`Added BDEU WETH Uniswap oracle`);

  //todo ag replace with a better implementaion (price from uniswap3?)
  const btc_eth_oracle = await hre.deployments.deploy('BtcToEthOracle', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    args: [constants.BTC_ETH_CHAINLINK_FEED[networkName], constants.wETH_address[networkName]]
  });

  const bdeuWethPool = await hre.ethers.getContract('BDEU_WETH_POOL') as BdStablePool;
  const bdeuWbtcPool = await hre.ethers.getContract('BDEU_WBTC_POOL') as BdStablePool;
  const weth_to_weth_oracle = await hre.deployments.deploy('WethToWethOracle', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    args: [constants.wETH_address[networkName]]
  });

  await bdeuWethPool.setCollatWETHOracle(weth_to_weth_oracle.address, constants.wETH_address[networkName]);
  await bdeuWbtcPool.setCollatWETHOracle(btc_eth_oracle.address, constants.wETH_address[networkName]);

  // One time migration
  return true;
};

func.id = __filename
func.tags = ['PriceFeeds'];
func.dependencies = ['StakingRewards'];
export default func;