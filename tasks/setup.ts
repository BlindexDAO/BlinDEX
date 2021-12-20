import { task } from "hardhat/config";
import { getDeployer, mintWbtc, mintWeth } from "../utils/DeployedContractsHelpers";
import { to_d18, to_d8 } from "../utils/NumbersHelpers";
import { setUpFunctionalSystem, setUpFunctionalSystemSmall } from "../utils/SystemSetup";

export function load() {
  task("initialize").setAction(async (args, hre) => {
    await setUpFunctionalSystem(hre, 1, 1000, false);
  });

  task("initialize:local").setAction(async (args, hre) => {
    const deployer = await getDeployer(hre);

    // mint initial WETH
    await mintWeth(hre, deployer, to_d18(100));

    // mint inital WBTC
    await mintWbtc(hre, deployer, to_d8(100));

    await setUpFunctionalSystem(hre, 1, 1000, false);
  });

  task("initialize:min").setAction(async (args, hre) => {
    await setUpFunctionalSystemSmall(hre);
  });

  task("initialize:min:local").setAction(async (args, hre) => {
    const deployer = await getDeployer(hre);

    // mint initial WETH
    await mintWeth(hre, deployer, to_d18(1));

    // mint inital WBTC
    await mintWbtc(hre, deployer, to_d8(0.1));

    await setUpFunctionalSystemSmall(hre);
  });
}
