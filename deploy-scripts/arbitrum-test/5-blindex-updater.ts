import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../../utils/Constants";
import { getDeployer } from "../../utils/DeployedContractsHelpers";
import type { DeployResult } from "hardhat-deploy/dist/types";
import { deployContract } from "../../utils/DeploymentHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  return await deployContract("BlindexUpdater", async () => {
    const deployer = await getDeployer(hre);

    const updater: DeployResult = await hre.deployments.deploy("BlindexUpdater", {
      from: deployer.address,
      contract: "BlindexUpdater",
      args: [constants.botAddress[hre.network.name]]
    });

    console.log("Deployed BlindexUpdater to: " + updater.address);
  });
};

func.id = __filename;
func.tags = ["BlindexUpdater"];
func.dependencies = ["StakingRewardsDistribution"];

export default func;
