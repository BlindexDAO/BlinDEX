import { task } from "hardhat/config";
import { getDeployer, getTreasury, mintWbtc, mintWeth } from "../utils/DeployedContractsHelpers";
import { to_d18, to_d8 } from "../utils/NumbersHelpers";
import { setupProductionReadySystem } from "../utils/SystemSetup";
const { types } = require("hardhat/config");

export function load() {
  task("initialize")
    .addParam("etheur", "initial eth/eur Price")
    .addParam("btceur", "initial btc/eur Price")
    .addParam("bdxeur", "initial bdx/eur Price")
    .setAction(async ({ etheur, btceur, bdxeur }, hre) => {
      await setupProductionReadySystem(hre, etheur, btceur, bdxeur);
    });

  task("initialize:local")
    .addOptionalParam("etheur", "initial eth/eur Price", 4093, types.float)
    .addOptionalParam("btceur", "initial btc/eur Price", 50353, types.float)
    .addOptionalParam("bdxeur", "initial bdx/eur Price", 0.89, types.float)
    .setAction(async ({ etheur, btceur, bdxeur }, hre) => {
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

      await setupProductionReadySystem(hre, etheur, btceur, bdxeur);
    });
}
