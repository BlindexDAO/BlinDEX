import { BDXShares } from '../typechain/BDXShares';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { OracleBasedCryptoFiatFeed } from '../typechain/OracleBasedCryptoFiatFeed';
import * as constants from '../utils/Constants'
import { getWethPair } from '../utils/Swaps'
import { BDStable } from '../typechain/BDStable';
import { ICryptoPairOracle } from '../typechain/ICryptoPairOracle';
import { BdStablePool } from '../typechain/BdStablePool';
import { DeployResult } from 'hardhat-deploy/dist/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: price feeds");

  const networkName = hre.network.name;
  const deployer = (await hre.getNamedAccounts()).DEPLOYER;
  const bdeu = await hre.ethers.getContract("BDEU") as BDStable;

  let priceFeed_EUR_USD_Deployment : DeployResult;
  let priceFeed_ETH_USD_Deployment : DeployResult;
  let btc_eth_oracle: DeployResult;

  if(networkName == "rsk") {
    priceFeed_EUR_USD_Deployment = await hre.deployments.deploy('PriceFeed_EUR_USD', {
      from: deployer,
      contract: "FiatToFiatPseudoOracleFeed",
      args: [(await hre.getNamedAccounts()).BOT]
    });
    console.log("deployed PriceFeed_EUR_USD to: " + priceFeed_EUR_USD_Deployment.address);

    priceFeed_ETH_USD_Deployment = await hre.deployments.deploy('PriceFeed_ETH_USD', {
      from: deployer,
      contract: "MoneyOnChainPriceFeed",
      args: [constants.ETH_USD_FEED_ADDRESS[networkName]]
    });
    console.log("deployed PriceFeed_ETH_USD to: " + priceFeed_ETH_USD_Deployment.address);

    //todo ag replace with a better implementaion (price from sovryn swap?)
    btc_eth_oracle = await hre.deployments.deploy('BtcToEthOracle', {
      from: deployer,
      contract: "BtcToEthOracleMoneyOnChain",
      args: [constants.BTC_ETH_FEED_ADDRESS[networkName], constants.wETH_address[networkName]]
    });
    console.log("deployed BtcToEthOracle to: " + btc_eth_oracle.address);
  } else {
    priceFeed_EUR_USD_Deployment = await hre.deployments.deploy('PriceFeed_EUR_USD', {
      from: deployer,
      contract: "AggregatorV3PriceFeed",
      args: [constants.EUR_USD_FEED_ADDRESS[networkName]]
    });
    console.log("deployed PriceFeed_EUR_USD to: " + priceFeed_EUR_USD_Deployment.address);

    priceFeed_ETH_USD_Deployment = await hre.deployments.deploy('PriceFeed_ETH_USD', {
      from: deployer,
      contract: "AggregatorV3PriceFeed",
      args: [constants.ETH_USD_FEED_ADDRESS[networkName]]
    });
    console.log("deployed PriceFeed_ETH_USD to: " + priceFeed_ETH_USD_Deployment.address);

    //todo ag replace with a better implementaion (price from uniswap3?)
    btc_eth_oracle = await hre.deployments.deploy('BtcToEthOracle', {
      from: deployer,
      contract: "BtcToEthOracleChinlink",
      args: [constants.BTC_ETH_FEED_ADDRESS[networkName], constants.wETH_address[networkName]]
    });
    console.log("deployed BtcToEthOracle to: " + btc_eth_oracle.address);
  }

  await hre.deployments.deploy('OracleBasedCryptoFiatFeed_ETH_EUR', {
    from: deployer,
    contract: "OracleBasedCryptoFiatFeed",
    args: [priceFeed_EUR_USD_Deployment.address, priceFeed_ETH_USD_Deployment.address]
  });

  const oracleBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract("OracleBasedCryptoFiatFeed_ETH_EUR") as OracleBasedCryptoFiatFeed;
  console.log("OracleBasedCryptoFiatFeed_ETH_EUR deployed to:", oracleBasedCryptoFiatFeed_ETH_EUR.address);
  
  await bdeu.setETH_fiat_Oracle(oracleBasedCryptoFiatFeed_ETH_EUR.address);
  console.log(`Added WETH EUR oracle to BDEU`)

  const bdxWethOracle = await getWethPair(hre,"BDXShares");
  await (await bdeu.setBDX_WETH_Oracle(bdxWethOracle.address, constants.wETH_address[networkName])).wait();
  console.log(`Added BDX ETH Uniswap oracle`);

  const bdeuWethOracle = await getWethPair(hre,"BDEU");
  await (await bdeu.setBDStable_WETH_Oracle(bdeuWethOracle.address, constants.wETH_address[networkName])).wait();
  console.log(`Added BDEU ETH Uniswap oracle`);

  const bdeuWethPool = await hre.ethers.getContract('BDEU_WETH_POOL') as BdStablePool;
  const bdeuWbtcPool = await hre.ethers.getContract('BDEU_WBTC_POOL') as BdStablePool;
  const weth_to_weth_oracle = await hre.deployments.deploy('WethToWethOracle', {
    from: deployer,
    args: [constants.wETH_address[networkName]]
  });

  await (await bdeuWethPool.setCollatWETHOracle(weth_to_weth_oracle.address, constants.wETH_address[networkName])).wait();
  await (await bdeuWbtcPool.setCollatWETHOracle(btc_eth_oracle.address, constants.wETH_address[networkName])).wait();

  console.log("finished deployment: price feeds");

  // One time migration
  return true;
};

func.id = __filename
func.tags = ['PriceFeeds'];
func.dependencies = ['StakingRewards'];
export default func;