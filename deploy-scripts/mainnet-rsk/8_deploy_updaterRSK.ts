import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../../utils/Constants";
import { getBot, getDeployer } from "../../utils/DeployedContractsHelpers";
import type { DeployResult } from "hardhat-deploy/dist/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: BlindexUpdater");

  const deployer = await getDeployer(hre);
  const botAddress = hre.network.name === "mainnetFork" ? (await getBot(hre)).address : constants.botAddress[hre.network.name];

  const updater: DeployResult = await hre.deployments.deploy("BlindexUpdater", {
    from: deployer.address,
    contract: "BlindexUpdater",
    args: [botAddress]
  });
  console.log("deployed BlindexUpdater to: " + updater.address);
  console.log("finished deployment: BlindexUpdater");

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["UpdaterRSK"];
func.dependencies = ["PriceFeeds", "LiquidityPools", "BDEU"];
export default func;
