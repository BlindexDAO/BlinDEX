import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import type { OracleBasedCryptoFiatFeed } from "../typechain/OracleBasedCryptoFiatFeed";
import type { OracleBasedWethUSDFeed } from "../typechain/OracleBasedWethUSDFeed";
import * as constants from "../utils/Constants";
import { getAllBDStables, getBDStableWbtcPool, getBDStableWethPool, getBot, getDeployer, getWethPairOracle } from "../utils/DeployedContractsHelpers";
import type { DeployResult } from "hardhat-deploy/dist/types";
import { to_d12 } from "../utils/NumbersHelpers";

export const ContractsNames = {
  priceFeedEurUsdName: "PriceFeed_EUR_USD",
  priceFeedETHUsdName: "PriceFeed_ETH_USD",
  BtcToEthOracle: "BtcToEthOracle",
  oracleEthEurName: "OracleBasedCryptoFiatFeed_ETH_EUR",
  oracleEthUsdName: "OracleBasedWethUSDFeed_ETH_USD"
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: price feeds");

  const networkName = hre.network.name;
  const deployer = await getDeployer(hre);
  const bot = await getBot(hre);

  let priceFeed_EUR_USD_Deployment: DeployResult;
  let priceFeed_ETH_USD_Deployment: DeployResult;
  let btc_eth_oracle: DeployResult;

  if (networkName == "rsk") {
    priceFeed_EUR_USD_Deployment = await hre.deployments.deploy(ContractsNames.priceFeedEurUsdName, {
      from: deployer.address,
      contract: "FiatToFiatPseudoOracleFeed",
      args: [bot.address, to_d12(1.13)]
    });
    console.log(`deployed ${ContractsNames.priceFeedEurUsdName} to: ${priceFeed_EUR_USD_Deployment.address}`);

    priceFeed_ETH_USD_Deployment = await hre.deployments.deploy(ContractsNames.priceFeedETHUsdName, {
      from: deployer.address,
      contract: "SovrynSwapPriceFeed",
      args: [
        constants.RSK_SOVRYN_NETWORK,
        constants.wETH_address[hre.network.name], // it's actually wrBTC (on RSK)
        constants.RSK_XUSD_ADDRESS,
        1e12,
        bot.address,
        60 * 60, // 60 min
        60 * 75 // 75 min
      ]
    });
    console.log(`deployed ${ContractsNames.priceFeedETHUsdName} to: ${priceFeed_ETH_USD_Deployment.address}`);

    btc_eth_oracle = await hre.deployments.deploy(ContractsNames.BtcToEthOracle, {
      from: deployer.address,
      contract: "SovrynSwapPriceFeed",
      args: [
        constants.RSK_SOVRYN_NETWORK,
        constants.wETH_address[hre.network.name],
        constants.wBTC_address[hre.network.name],
        1e12,
        bot.address,
        60 * 60, // 60 min
        60 * 75 // 75 min
      ] // price is reverted on RSK, it's actually ETH/USD
    });
    console.log(`deployed ${ContractsNames.BtcToEthOracle} to: ${btc_eth_oracle.address}`);
  } else {
    priceFeed_EUR_USD_Deployment = await hre.deployments.deploy(ContractsNames.priceFeedEurUsdName, {
      from: deployer.address,
      contract: "AggregatorV3PriceFeed",
      args: [constants.EUR_USD_FEED_ADDRESS[networkName]]
    });
    console.log(`deployed ${ContractsNames.priceFeedEurUsdName} to: ${priceFeed_EUR_USD_Deployment.address}`);

    priceFeed_ETH_USD_Deployment = await hre.deployments.deploy(ContractsNames.priceFeedETHUsdName, {
      from: deployer.address,
      contract: "AggregatorV3PriceFeed",
      args: [constants.ETH_USD_FEED_ADDRESS[networkName]]
    });
    console.log(`deployed ${ContractsNames.priceFeedETHUsdName} to: ${priceFeed_ETH_USD_Deployment.address}`);

    // if deployed on ETH, probably we should replace with a better implementaion (price from uniswap3?)
    // chainlink has big lag
    btc_eth_oracle = await hre.deployments.deploy(ContractsNames.BtcToEthOracle, {
      from: deployer.address,
      contract: "BtcToEthOracleChinlink",
      args: [constants.BTC_ETH_FEED_ADDRESS[networkName], constants.wETH_address[networkName]]
    });
    console.log(`deployed ${ContractsNames.BtcToEthOracle} to: ${btc_eth_oracle.address}`);
  }

  await hre.deployments.deploy(ContractsNames.oracleEthEurName, {
    from: deployer.address,
    contract: "OracleBasedCryptoFiatFeed",
    args: [priceFeed_EUR_USD_Deployment.address, priceFeed_ETH_USD_Deployment.address]
  });

  const bdstables = await getAllBDStables(hre);
  const bdxWethOracle = await getWethPairOracle(hre, "BDX");

  for (const stable of bdstables) {
    const symbol = await stable.symbol();
    let oracleBasedCryptoFiatFeed_ETH_Stable;

    // Since our base fiat currently is USD, BDUS is a special case as it needs its own oracle that is just a dumb adapter from our ETH/USD price feed
    if (symbol === "BDUS") {
      await hre.deployments.deploy(ContractsNames.oracleEthUsdName, {
        from: deployer.address,
        contract: "OracleBasedWethUSDFeed",
        args: [priceFeed_ETH_USD_Deployment.address]
      });
      oracleBasedCryptoFiatFeed_ETH_Stable = (await hre.ethers.getContract(ContractsNames.oracleEthUsdName)) as OracleBasedWethUSDFeed;
    } else {
      // TODO: At the moment this only support Euro. We should make this part generic as well - https://lagoslabs.atlassian.net/browse/LAGO-125
      oracleBasedCryptoFiatFeed_ETH_Stable = (await hre.ethers.getContract(ContractsNames.oracleEthEurName)) as OracleBasedCryptoFiatFeed;
      console.log(`${ContractsNames.oracleEthEurName} deployed to:`, oracleBasedCryptoFiatFeed_ETH_Stable.address);
    }

    await (await stable.setETH_fiat_Oracle(oracleBasedCryptoFiatFeed_ETH_Stable.address)).wait();
    console.log(`Added WETH/Fiat oracle to ${symbol}`);

    const bdstableWethOracle = await getWethPairOracle(hre, symbol);
    await (await stable.setBDStable_WETH_Oracle(bdstableWethOracle.address, constants.wETH_address[networkName])).wait();
    console.log(`Added ${symbol}/WETH Uniswap oracle`);

    const bdstableWethPool = await getBDStableWethPool(hre, symbol);
    const bdstableWbtcPool = await getBDStableWbtcPool(hre, symbol);
    const weth_to_weth_oracle = await hre.deployments.deploy("WethToWethOracle", {
      from: deployer.address,
      args: [constants.wETH_address[networkName]]
    });

    await (await bdstableWethPool.setCollatWETHOracle(weth_to_weth_oracle.address, constants.wETH_address[networkName])).wait();
    console.log(`Added ${symbol}/WETH bdstable pool oracle`);
    await (await bdstableWbtcPool.setCollatWETHOracle(btc_eth_oracle.address, constants.wETH_address[networkName])).wait();
    console.log(`Added ${symbol}/WBTC bdstable pool oracle`);

    await (await stable.setBDX_WETH_Oracle(bdxWethOracle.address, constants.wETH_address[networkName])).wait();
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
