import { BDXShares } from '../typechain/BDXShares';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { OracleBasedCryptoFiatFeed } from '../typechain/OracleBasedCryptoFiatFeed';
import * as constants from '../utils/Constants'
import { getBot, getDeployer, getWethPair, getWethPairOracle } from '../utils/DeployedContractsHelpers'
import { BDStable } from '../typechain/BDStable';
import { ICryptoPairOracle } from '../typechain/ICryptoPairOracle';
import { BdStablePool } from '../typechain/BdStablePool';
import { DeployResult } from 'hardhat-deploy/dist/types';
import { to_d12 } from '../utils/NumbersHelpers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: price feeds");

  const networkName = hre.network.name;
  const deployer = await getDeployer(hre);
  const bot = await getBot(hre);
  const bdeu = await hre.ethers.getContract("BDEU") as BDStable;

  let priceFeed_EUR_USD_Deployment : DeployResult;
  let priceFeed_ETH_USD_Deployment : DeployResult;
  let btc_eth_oracle: DeployResult;

  if(networkName == "rsk") {
    priceFeed_EUR_USD_Deployment = await hre.deployments.deploy('PriceFeed_EUR_USD', {
      from: deployer.address,
      contract: "FiatToFiatPseudoOracleFeed",
      args: [bot.address, to_d12(1.13)]
    });
    console.log("deployed PriceFeed_EUR_USD to: " + priceFeed_EUR_USD_Deployment.address);

    priceFeed_ETH_USD_Deployment = await hre.deployments.deploy('PriceFeed_ETH_USD', { 
      from: deployer.address,
      contract: "SovrynSwapPriceFeed",
      args: [
        constants.RSK_SOVRYN_NETWORK,
        constants.wETH_address[hre.network.name], // it's actually wrBTC (on RSK)
        constants.RSK_XUSD_ADDRESS,
        1e12,
        bot.address,
        60 * 60, // 60 min
        60 * 75  // 75 min
      ]
    });
    console.log("deployed PriceFeed_ETH_USD to: " + priceFeed_ETH_USD_Deployment.address);

    btc_eth_oracle = await hre.deployments.deploy('BtcToEthOracle', {
      from: deployer.address,
      contract: "SovrynSwapPriceFeed",
      args: [
        constants.RSK_SOVRYN_NETWORK,
        constants.wETH_address[hre.network.name],
        constants.wBTC_address[hre.network.name],
        1e12,
        bot.address,
        60 * 60, // 60 min
        60 * 75  // 75 min
      ] // price is reverted on RSK, it's actually ETH/USD
    });
    console.log("deployed BtcToEthOracle to: " + btc_eth_oracle.address);

  } else {
    priceFeed_EUR_USD_Deployment = await hre.deployments.deploy('PriceFeed_EUR_USD', {
      from: deployer.address,
      contract: "AggregatorV3PriceFeed",
      args: [constants.EUR_USD_FEED_ADDRESS[networkName]]
    });
    console.log("deployed PriceFeed_EUR_USD to: " + priceFeed_EUR_USD_Deployment.address);

    priceFeed_ETH_USD_Deployment = await hre.deployments.deploy('PriceFeed_ETH_USD', {
      from: deployer.address,
      contract: "AggregatorV3PriceFeed",
      args: [constants.ETH_USD_FEED_ADDRESS[networkName]]
    });
    console.log("deployed PriceFeed_ETH_USD to: " + priceFeed_ETH_USD_Deployment.address);

    // if deployed on ETH, probably we should replace with a better implementaion (price from uniswap3?)
    // chainlink has big lag
    btc_eth_oracle = await hre.deployments.deploy('BtcToEthOracle', {
      from: deployer.address,
      contract: "BtcToEthOracleChinlink",
      args: [constants.BTC_ETH_FEED_ADDRESS[networkName], constants.wETH_address[networkName]]
    });
    console.log("deployed BtcToEthOracle to: " + btc_eth_oracle.address);
  }

  await hre.deployments.deploy('OracleBasedCryptoFiatFeed_ETH_EUR', {
    from: deployer.address,
    contract: "OracleBasedCryptoFiatFeed",
    args: [priceFeed_EUR_USD_Deployment.address, priceFeed_ETH_USD_Deployment.address]
  });

  const oracleBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract("OracleBasedCryptoFiatFeed_ETH_EUR") as OracleBasedCryptoFiatFeed;
  console.log("OracleBasedCryptoFiatFeed_ETH_EUR deployed to:", oracleBasedCryptoFiatFeed_ETH_EUR.address);
  
  await (await bdeu.setETH_fiat_Oracle(oracleBasedCryptoFiatFeed_ETH_EUR.address)).wait();
  console.log(`Added WETH EUR oracle to BDEU`)

  const bdxWethOracle = await getWethPairOracle(hre,"BDX");
  await (await bdeu.setBDX_WETH_Oracle(bdxWethOracle.address, constants.wETH_address[networkName])).wait();
  console.log(`Added BDX ETH Uniswap oracle`);

  const bdeuWethOracle = await getWethPairOracle(hre,"BDEU");
  await (await bdeu.setBDStable_WETH_Oracle(bdeuWethOracle.address, constants.wETH_address[networkName])).wait();
  console.log(`Added BDEU ETH Uniswap oracle`);

  const bdeuWethPool = await hre.ethers.getContract('BDEU_WETH_POOL') as BdStablePool;
  const bdeuWbtcPool = await hre.ethers.getContract('BDEU_WBTC_POOL') as BdStablePool;
  const weth_to_weth_oracle = await hre.deployments.deploy('WethToWethOracle', {
    from: deployer.address,
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