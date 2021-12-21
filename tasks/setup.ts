import { task } from "hardhat/config";
import { getDeployer, getTreasury, mintWbtc, mintWeth } from "../utils/DeployedContractsHelpers";
import { to_d18, to_d8 } from "../utils/NumbersHelpers";
import { setupProductionReadySystem, setUpFunctionalSystemSmall } from "../utils/SystemSetup";

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

  task("initialize:local:min")
    .setAction(async (args, hre) => {
      const deployer = await getDeployer(hre);

      // mint initial WETH
      await mintWeth(hre, deployer, to_d18(1));

      // mint inital WBTC
      await mintWbtc(hre, deployer, to_d8(0.1), 100);

      await setUpFunctionalSystemSmall(hre);
    });
}

