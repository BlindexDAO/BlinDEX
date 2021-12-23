import { task } from "hardhat/config";
import { getDeployer, getTreasury, mintWbtc, mintWeth } from "../utils/DeployedContractsHelpers";
import { to_d18, to_d8 } from "../utils/NumbersHelpers";
import { setupProductionReadySystem, setUpFunctionalSystemSmall } from "../utils/SystemSetup";
const { types } = require("hardhat/config")

export function load() {
  task("initialize")
    .addParam("wethbdeu", "initial Weth/BdEu Price")
    .addParam("wbtcbdeu", "initial Wbtc/BdEu Price")
    .addParam("bdxbdeu", "initial Bdx/BdEu Price")
    .setAction(async ({ wethbdeu, wbtcbdeu, bdxbdeu }, hre) => {
      await setupProductionReadySystem(hre, wethbdeu, wbtcbdeu, bdxbdeu);
    });

  task("initialize:local")
    .addOptionalParam("wethbdeu", "initial Weth/BdEu Price", 4093, types.float)
    .addOptionalParam("wbtcbdeu", "initial Wbtc/BdEu Price", 50353, types.float)
    .addOptionalParam("bdxbdeu", "initial Bdx/BdEu Price", 0.89, types.float)
    .setAction(async ({ wethbdeu, wbtcbdeu, bdxbdeu }, hre) => {
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

      await setupProductionReadySystem(hre, wethbdeu, wbtcbdeu, bdxbdeu);
    });

  task("initialize:min")
    .addParam("wethbdeu", "initial Weth/BdEu Price")
    .addParam("wbtcbdeu", "initial Wbtc/BdEu Price")
    .addParam("bdxbdeu", "initial Bdx/BdEu Price")
    .setAction(async ({ wethbdeu, wbtcbdeu, bdxbdeu }, hre) => {
      await setUpFunctionalSystemSmall(hre, wethbdeu, wbtcbdeu, bdxbdeu);
    });

  task("initialize:local:min")
    .addOptionalParam("wethbdeu", "initial Weth/BdEu Price", 4093, types.float)
    .addOptionalParam("wbtcbdeu", "initial Wbtc/BdEu Price", 50353, types.float)
    .addOptionalParam("bdxbdeu", "initial Bdx/BdEu Price", 0.89, types.float)
    .setAction(async ({ wethbdeu, wbtcbdeu, bdxbdeu }, hre) => {
      const deployer = await getDeployer(hre);

      // mint initial WETH
      await mintWeth(hre, deployer, to_d18(1));

      // mint inital WBTC
      await mintWbtc(hre, deployer, to_d8(0.1), 100);

      await setUpFunctionalSystemSmall(hre, wethbdeu, wbtcbdeu, bdxbdeu);
    });
}
