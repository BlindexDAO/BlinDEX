import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../utils/Constants";
import {
  formatAddress,
  getBDStableWbtcPool,
  getBDStableWethPool,
  getBgbp,
  getBot,
  getBxau,
  getDeployer,
  getWethPairOracle
} from "../utils/DeployedContractsHelpers";
import type { DeployResult } from "hardhat-deploy/dist/types";
import { to_d12 } from "../utils/NumbersHelpers";

export const PriceFeedContractNames = {
  XAU_USD: "PriceFeed_XAU_USD",
  GBP_USD: "PriceFeed_GBP_USD",
  ETH_USD: "PriceFeed_ETH_USD",
  BTC_ETH: "BtcToEthOracle",
  ETH_XAU: "OracleBasedCryptoFiatFeed_ETH_XAU",
  ETH_GBP: "OracleBasedCryptoFiatFeed_ETH_GBP"
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: price feeds");

  const networkName = hre.network.name;
  const deployer = await getDeployer(hre);
  const bot = await getBot(hre);

  let priceFeed_XAU_USD_Deployment: DeployResult;
  let priceFeed_GBP_USD_Deployment: DeployResult;

  if (networkName === "rsk") {
    priceFeed_XAU_USD_Deployment = await hre.deployments.deploy(PriceFeedContractNames.XAU_USD, {
      from: deployer.address,
      contract: "FiatToFiatPseudoOracleFeed",
      args: [bot.address, to_d12(1922.78)]
    });
    console.log(`deployed ${PriceFeedContractNames.XAU_USD} to: ${priceFeed_XAU_USD_Deployment.address}`);

    priceFeed_GBP_USD_Deployment = await hre.deployments.deploy(PriceFeedContractNames.GBP_USD, {
      from: deployer.address,
      contract: "FiatToFiatPseudoOracleFeed",
      args: [bot.address, to_d12(1.31)]
    });
    console.log(`deployed ${PriceFeedContractNames.GBP_USD} to: ${priceFeed_GBP_USD_Deployment.address}`);
  } else {
    priceFeed_XAU_USD_Deployment = await hre.deployments.deploy(PriceFeedContractNames.XAU_USD, {
      from: deployer.address,
      contract: "AggregatorV3PriceFeed",
      args: [constants.XAU_USD_FEED_ADDRESS[networkName]]
    });
    console.log(`deployed ${PriceFeedContractNames.XAU_USD} to: ${priceFeed_XAU_USD_Deployment.address}`);

    priceFeed_GBP_USD_Deployment = await hre.deployments.deploy(PriceFeedContractNames.GBP_USD, {
      from: deployer.address,
      contract: "AggregatorV3PriceFeed",
      args: [constants.GBP_USD_FEED_ADDRESS[networkName]]
    });
    console.log(`deployed ${PriceFeedContractNames.GBP_USD} to: ${priceFeed_GBP_USD_Deployment.address}`);
  }

  console.log(`Get contract ${PriceFeedContractNames.ETH_USD}`);
  const priceFeedEthUsd = await hre.ethers.getContract(PriceFeedContractNames.ETH_USD, deployer);
  console.log(`Contract ${PriceFeedContractNames.ETH_USD} address is ${priceFeedEthUsd.address}`);

  const ethXauOracleDeployment = await hre.deployments.deploy(PriceFeedContractNames.ETH_XAU, {
    from: deployer.address,
    contract: "OracleBasedCryptoFiatFeed",
    args: [priceFeed_XAU_USD_Deployment.address, priceFeedEthUsd.address]
  });
  console.log(`deployed ${PriceFeedContractNames.ETH_XAU} to: ${ethXauOracleDeployment.address}`);

  const ethGbpOracleDeployment = await hre.deployments.deploy(PriceFeedContractNames.ETH_GBP, {
    from: deployer.address,
    contract: "OracleBasedCryptoFiatFeed",
    args: [priceFeed_GBP_USD_Deployment.address, priceFeedEthUsd.address]
  });
  console.log(`deployed ${PriceFeedContractNames.ETH_GBP} to: ${ethGbpOracleDeployment.address}`);

  const bdStablesWithWethOracles = [
    { stable: await getBxau(hre), ethFiatOracle: ethXauOracleDeployment.address },
    { stable: await getBgbp(hre), ethFiatOracle: ethGbpOracleDeployment.address }
  ];

  const bdxWethOracle = await getWethPairOracle(hre, "BDX");
  const weth_to_weth_oracle = await hre.ethers.getContract("WethToWethOracle");
  const btc_eth_oracle = await hre.ethers.getContract(PriceFeedContractNames.BTC_ETH);

  for (const { stable, ethFiatOracle } of bdStablesWithWethOracles) {
    const symbol = await stable.symbol();

    await (await stable.setETH_fiat_Oracle(ethFiatOracle)).wait();
    console.log(`Added WETH/Fiat oracle to ${symbol}`);

    const bdstableWethOracle = await getWethPairOracle(hre, symbol);
    await (await stable.setBDStable_WETH_Oracle(bdstableWethOracle.address, formatAddress(hre, constants.wETH_address[networkName]))).wait();
    console.log(`Added ${symbol}/WETH Uniswap oracle`);

    const bdstableWethPool = await getBDStableWethPool(hre, symbol);
    const bdstableWbtcPool = await getBDStableWbtcPool(hre, symbol);

    await (await bdstableWethPool.setCollatWETHOracle(weth_to_weth_oracle.address, formatAddress(hre, constants.wETH_address[networkName]))).wait();
    console.log(`Added ${symbol}/WETH bdstable pool oracle`);
    await (await bdstableWbtcPool.setCollatWETHOracle(btc_eth_oracle.address, formatAddress(hre, constants.wETH_address[networkName]))).wait();
    console.log(`Added ${symbol}/WBTC bdstable pool oracle`);

    await (await stable.setBDX_WETH_Oracle(bdxWethOracle.address, formatAddress(hre, constants.wETH_address[networkName]))).wait();
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
