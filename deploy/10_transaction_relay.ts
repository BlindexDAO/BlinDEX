import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getDeployer } from "../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: TransactionRelay");

  const deployer = await getDeployer(hre);
  await hre.deployments.deploy("TransactionRelay", {
    from: deployer.address,
    args: []
  });

  console.log("finished deployment: TransactionRelay");

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["transaction-relay"];
func.dependencies = [];
export default func;
