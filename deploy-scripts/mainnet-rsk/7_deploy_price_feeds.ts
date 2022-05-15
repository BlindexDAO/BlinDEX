import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import {
  PriceFeedContractNames,
  chainlinkPriceFeeds,
  wrappedNativeTokenData,
  wrappedSecondaryTokenData,
  chainSpecificComponents,
  EXTERNAL_USD_STABLE
} from "../../utils/Constants";
import {
  formatAddress,
  getBdEu,
  getBDStableWbtcPool,
  getBDStableWethPool,
  getBdUs,
  getBot,
  getDeployer,
  getWethPairOracle
} from "../../utils/DeployedContractsHelpers";
import type { DeployResult } from "hardhat-deploy/dist/types";
import { to_d12 } from "../../utils/NumbersHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: price feeds");

  const networkName = hre.network.name;
  const deployer = await getDeployer(hre);
  const bot = await getBot(hre);

  let priceFeed_EUR_USD_Deployment: DeployResult;
  let priceFeed_ETH_USD_Deployment: DeployResult;
  let btc_eth_oracle: DeployResult;

  if (networkName === "rsk") {
    priceFeed_EUR_USD_Deployment = await hre.deployments.deploy(PriceFeedContractNames.EUR_USD, {
      from: deployer.address,
      contract: "FiatToFiatPseudoOracleFeed",
      args: [bot.address, to_d12(1.13)]
    });
    console.log(`deployed ${PriceFeedContractNames.EUR_USD} to: ${priceFeed_EUR_USD_Deployment.address}`);

    const sovrynNetworkAddress = chainSpecificComponents[hre.network.name].sovrynNetwork as string;

    priceFeed_ETH_USD_Deployment = await hre.deployments.deploy(PriceFeedContractNames.ETH_USD, {
      from: deployer.address,
      contract: "SovrynSwapPriceFeed",
      args: [
        formatAddress(hre, sovrynNetworkAddress),
        formatAddress(hre, wrappedNativeTokenData[hre.network.name].address), // it's actually wrBTC (on RSK)
        formatAddress(hre, EXTERNAL_USD_STABLE[hre.network.name].address),
        1e12,
        bot.address,
        60 * 60, // 60 min
        60 * 75 // 75 min
      ]
    });
    console.log(`deployed ${PriceFeedContractNames.ETH_USD} to: ${priceFeed_ETH_USD_Deployment.address}`);

    // This is BTC/ETH on both networks
    btc_eth_oracle = await hre.deployments.deploy(PriceFeedContractNames.BTC_ETH, {
      from: deployer.address,
      contract: "SovrynSwapPriceFeed",
      args: [
        formatAddress(hre, sovrynNetworkAddress),
        formatAddress(hre, wrappedNativeTokenData[hre.network.name].address),
        formatAddress(hre, wrappedSecondaryTokenData[hre.network.name].address),
        1e12,
        bot.address,
        60 * 60, // 60 min
        60 * 75 // 75 min
      ] // price is reverted on RSK, it's actually ETH/USD
    });
    console.log(`deployed ${PriceFeedContractNames.BTC_ETH} to: ${btc_eth_oracle.address}`);
  } else {
    priceFeed_EUR_USD_Deployment = await hre.deployments.deploy(PriceFeedContractNames.EUR_USD, {
      from: deployer.address,
      contract: "AggregatorV3PriceFeed",
      args: [chainlinkPriceFeeds.EUR_USD_FEED_ADDRESS[networkName]?.address]
    });
    console.log(`deployed ${PriceFeedContractNames.EUR_USD} to: ${priceFeed_EUR_USD_Deployment.address}`);

    priceFeed_ETH_USD_Deployment = await hre.deployments.deploy(PriceFeedContractNames.ETH_USD, {
      from: deployer.address,
      contract: "AggregatorV3PriceFeed",
      args: [chainlinkPriceFeeds.ETH_USD_FEED_ADDRESS[networkName]?.address]
    });
    console.log(`deployed ${PriceFeedContractNames.ETH_USD} to: ${priceFeed_ETH_USD_Deployment.address}`);

    // if deployed on ETH, probably we should replace with a better implementaion (price from uniswap3?)
    // chainlink has big lag
    // This is BTC/ETH on both networks
    btc_eth_oracle = await hre.deployments.deploy(PriceFeedContractNames.BTC_ETH, {
      from: deployer.address,
      contract: "BtcToEthOracleChinlink",
      args: [chainlinkPriceFeeds.BTC_ETH_FEED_ADDRESS[networkName]?.address, formatAddress(hre, wrappedNativeTokenData[networkName].address)]
    });
    console.log(`deployed ${PriceFeedContractNames.BTC_ETH} to: ${btc_eth_oracle.address}`);
  }

  const ethEurOracleDeployment = await hre.deployments.deploy(PriceFeedContractNames.ETH_EUR, {
    from: deployer.address,
    contract: "OracleBasedCryptoFiatFeed",
    args: [priceFeed_EUR_USD_Deployment.address, priceFeed_ETH_USD_Deployment.address]
  });

  // Since our base fiat currently is USD, BDUS is a special case as it needs its own oracle that is just a dumb adapter from our ETH/USD price feed
  const ethUsdOracleDeployment = await hre.deployments.deploy(PriceFeedContractNames.ETH_USD_ADAPTER, {
    from: deployer.address,
    contract: "OracleBasedWethUSDFeed",
    args: [priceFeed_ETH_USD_Deployment.address]
  });
  console.log(`${PriceFeedContractNames.ETH_EUR} deployed to:`, ethUsdOracleDeployment.address);

  const bdStablesWithWethOracles = [
    { stable: await getBdEu(hre), ethFiatOracle: ethEurOracleDeployment.address },
    { stable: await getBdUs(hre), ethFiatOracle: ethUsdOracleDeployment.address }
  ];

  const bdxWethOracle = await getWethPairOracle(hre, "BDX");

  for (const { stable, ethFiatOracle } of bdStablesWithWethOracles) {
    const symbol = await stable.symbol();
    const wrappedNativeTokenAddress = wrappedNativeTokenData[networkName].address;

    await (await stable.setETH_fiat_Oracle(ethFiatOracle)).wait();
    console.log(`Added WETH/Fiat oracle to ${symbol}`);

    const bdstableWethOracle = await getWethPairOracle(hre, symbol);
    await (await stable.setBDStable_WETH_Oracle(bdstableWethOracle.address, formatAddress(hre, wrappedNativeTokenAddress))).wait();
    console.log(`Added ${symbol}/WETH Uniswap oracle`);

    const bdstableWethPool = await getBDStableWethPool(hre, symbol);
    const bdstableWbtcPool = await getBDStableWbtcPool(hre, symbol);
    const weth_to_weth_oracle = await hre.deployments.deploy("WethToWethOracle", {
      from: deployer.address,
      args: [formatAddress(hre, wrappedNativeTokenAddress)]
    });

    await (await bdstableWethPool.setCollatWETHOracle(weth_to_weth_oracle.address, formatAddress(hre, wrappedNativeTokenAddress))).wait();
    console.log(`Added ${symbol}/WETH bdstable pool oracle`);
    await (await bdstableWbtcPool.setCollatWETHOracle(btc_eth_oracle.address, formatAddress(hre, wrappedNativeTokenAddress))).wait();
    console.log(`Added ${symbol}/WBTC bdstable pool oracle`);

    await (await stable.setBDX_WETH_Oracle(bdxWethOracle.address, formatAddress(hre, wrappedNativeTokenAddress))).wait();
    console.log(`Added BDX/WETH Uniswap oracle to ${symbol}`);
  }

  console.log("Finished deployment: price feeds");

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["PriceFeeds"];
func.dependencies = ["StakingRewards"];
export default func;
