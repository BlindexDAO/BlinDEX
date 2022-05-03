import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../utils/Constants";
import { getBot, getDeployer } from "../utils/DeployedContractsHelpers";
import type { DeployResult } from "hardhat-deploy/dist/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: UpdaterRSK");

  const deployer = await getDeployer(hre);
  const botAddress = hre.network.name === "mainnetFork" ? (await getBot(hre)).address : constants.botAddress;

  const updater: DeployResult = await hre.deployments.deploy("UpdaterRSK", {
    from: deployer.address,
    contract: "UpdaterRSK",
    args: [botAddress]
  });
  console.log("deployed UpdaterRSK to: " + updater.address);
  console.log("finished deployment: UpdaterRSK");

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["UpdaterRSK"];
func.dependencies = ["PriceFeeds", "LiquidityPools", "BDEU"];
export default func;
