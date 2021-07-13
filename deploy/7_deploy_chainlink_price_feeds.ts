import { BDXShares } from './../typechain/BDXShares.d';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ChainlinkBasedCryptoFiatFeed } from '../typechain/ChainlinkBasedCryptoFiatFeed';
import * as constants from '../utils/Constants'
import { getWethPair } from '../utils/Swaps'
import { BDStable } from '../typechain/BDStable';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import { BdStablePool } from '../typechain/BdStablePool';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();

  const weth_eur_oracle = await hre.deployments.deploy('ChainlinkBasedCryptoFiatFeed_WETH_EUR', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "ChainlinkBasedCryptoFiatFeed",
    args: [constants.EUR_USD_CHAINLINK_FEED[networkName], constants.WETH_USD_CHAINLINK_FEED[networkName]]
  });

  const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract("ChainlinkBasedCryptoFiatFeed_WETH_EUR") as unknown as ChainlinkBasedCryptoFiatFeed;

  console.log("ChainlinkBasedCryptoFiatFeed_WETH_EUR deployed to:", chainlinkBasedCryptoFiatFeed_ETH_EUR.address);

  const wbtc_eur_oracle = await hre.deployments.deploy('ChainlinkBasedCryptoFiatFeed_WBTC_EUR', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "ChainlinkBasedCryptoFiatFeed",
    args: [constants.EUR_USD_CHAINLINK_FEED[networkName], constants.WBTC_USD_CHAINLINK_FEED[networkName]]
  });

  const chainlinkBasedCryptoFiatFeed_BTC_EUR = await hre.ethers.getContract("ChainlinkBasedCryptoFiatFeed_WBTC_EUR") as unknown as ChainlinkBasedCryptoFiatFeed;

  console.log("ChainlinkBasedCryptoFiatFeed_WETH_EUR deployed to:", chainlinkBasedCryptoFiatFeed_ETH_EUR.address);

  const bdeur = await hre.ethers.getContract("BDEUR") as unknown as BDStable;
  const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

  await (await bdeur.setETHFIATOracle(chainlinkBasedCryptoFiatFeed_ETH_EUR.address)).wait();
  console.log(`Added WETH EUR oracle to BDEUR`)

  const bdxWethOracle = await getWethPair(hre,"BDXShares");
  await (await bdeur.setBDX_WETH_Oracle(bdxWethOracle.address, constants.wETH_address[networkName])).wait();
  console.log(`Added BDX WETH Uniswap oracle`);

  const bdeurWethOracle = await getWethPair(hre,"BDEUR");
  await (await bdeur.setBDStable_WETH_Oracle(bdeurWethOracle.address, constants.wETH_address[networkName])).wait();
  console.log(`Added BDEUR WETH Uniswap oracle`);

  const uniswapFactoryContract = await hre.ethers.getContractAt("UniswapV2Factory", constants.uniswapFactoryAddress) as unknown as UniswapV2Factory;

  //todo ag replace with a better implementaion (price from uniswap3?)
  const btc_eth_oracle = await hre.deployments.deploy('BtcToEthOracle', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    args: [constants.BTC_ETH_CHAINLINK_FEED[networkName], constants.wETH_address[networkName]]
  });

  const bdeurWethPool = await hre.ethers.getContract('BDEUR_WETH_POOL') as BdStablePool;
  const bdeurWbtcPool = await hre.ethers.getContract('BDEUR_WBTC_POOL') as BdStablePool;
  const weth_to_weth_oracle = await hre.deployments.deploy('WethToWethOracle', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    args: [constants.wETH_address[networkName]]
  });
  await (await bdeurWethPool.setCollatWETHOracle(weth_to_weth_oracle.address, constants.wETH_address[networkName])).wait(); //replace with sth?
  await bdeurWbtcPool.setCollatWETHOracle(btc_eth_oracle.address, constants.wETH_address[networkName]);
  // One time migration
  return true;
};
func.id = __filename
func.tags = ['PriceFeeds'];
func.dependencies = ['StakingRewards'];
export default func;