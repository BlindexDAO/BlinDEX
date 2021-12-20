import { task } from "hardhat/config";
import { getDeployer, getTreasury, mintWbtc, mintWeth } from "../utils/DeployedContractsHelpers";
import { d18_ToNumber, to_d18, to_d8 } from "../utils/NumbersHelpers";
import { setUpFunctionalSystem, setUpFunctionalSystemSmall } from "../utils/SystemSetup";
import * as constants from "../utils/Constants";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export function load() {
  task("initialize")
    .setAction(async (args, hre) => {
      await setupProductionReadySystem(hre);
    });

  task("initialize:local")
    .setAction(async (args, hre) => {
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

      await setupProductionReadySystem(hre);
    });

  task("initialize:min")
    .setAction(async (args, hre) => {
      await setUpFunctionalSystemSmall(hre);
    });

  task("initialize:min:local")
    .setAction(async (args, hre) => {
      const deployer = await getDeployer(hre);

      // mint initial WETH
      await mintWeth(hre, deployer, to_d18(1));

      // mint inital WBTC
      await mintWbtc(hre, deployer, to_d8(0.1), 100);

      await setUpFunctionalSystemSmall(hre);
    });

  async function setupProductionReadySystem(hre: HardhatRuntimeEnvironment){
    await setUpFunctionalSystem(hre, 1, d18_ToNumber(constants.initalBdStableToOwner_d18[hre.network.name]), false);
  }
}