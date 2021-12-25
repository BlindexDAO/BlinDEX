import { task } from "hardhat/config";
import { ContractsDetails } from "../deploy/2_2_euro_usd_stablecoins";
import { getDeployer, getTreasury, mintWbtc, mintWeth } from "../utils/DeployedContractsHelpers";
import { to_d18, to_d8 } from "../utils/NumbersHelpers";
import { setupProductionReadySystem } from "../utils/SystemSetup";
const { types } = require("hardhat/config");

export function load() {
  task("initialize")
    .addParam("btcEUR", "initial btc/eur Price")
    .addParam("bdxEUR", "initial bdx/eur Price")
    .addParam("ethEUR", "initial eth/eur Price")
    .addParam("ethUSD", "initial eth/usd Price")
    .addParam("btcUSD", "initial eth/usd Price")
    .addParam("bdxUSD", "initial eth/usd Price")
    .setAction(async ({ btcEUR, bdxEUR, ethEUR, ethUSD, btcUSD, bdxUSD }, hre) => {
      await setupProductionReadySystem(hre, btcEUR, btcUSD, bdxEUR, bdxUSD, ethEUR, ethUSD);
    });

  task("initialize:local")
    .addOptionalParam("btcEUR", "initial btc/eur Price", 50353, types.float)
    .addOptionalParam("bdxEUR", "initial bdx/eur Price", 0.89, types.float)
    .addOptionalParam("ethEUR", "initial eth/eur Price", 4093, types.float)
    .addOptionalParam("ethUSD", "initial eth/usd Price", 4000, types.float)
    .addOptionalParam("btcUSD", "initial eth/usd Price", 57000, types.float)
    .addOptionalParam("bdxUSD", "initial eth/usd Price", 1, types.float)
    .setAction(async ({ btcEUR, bdxEUR, ethEUR, ethUSD, btcUSD, bdxUSD }, hre) => {
      const deployer = await getDeployer(hre);
      const treasury = await getTreasury(hre);

      // mint initial WETH
      await mintWeth(hre, deployer, to_d18(100));

      // mint inital WBTC
      await mintWbtc(hre, deployer, to_d8(10), 1000);

      // mint initial WETH
      await mintWeth(hre, treasury, to_d18(100));

      // mint inital WBTC
      await mintWbtc(hre, treasury, to_d8(10), 1000);

      await setupProductionReadySystem(hre, btcEUR, btcUSD, bdxEUR, bdxUSD, ethEUR, ethUSD);
    });
}
