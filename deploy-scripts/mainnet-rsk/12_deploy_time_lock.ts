import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, getExecutor, getProposer } from "../../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: Timelock");

  const day = 3600 * 24;

  const deployer = await getDeployer(hre);
  const proposer = await getProposer(hre);
  const executor = await getExecutor(hre);

  const timelock = await hre.deployments.deploy("Timelock", {
    from: deployer.address,
    args: [
      proposer.address,
      executor.address,
      hre.network.name === "rsk" ? day * 1 : 0, // min delay limit
      hre.network.name === "rsk" ? day * 1 : 0, // min delay
      day * 30, // max delay
      day * 7 // grace period
    ]
  });

  console.log("Timelock deployed to:", timelock.address);

  console.log("finished deployment: Timelock");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["Timelock"];
func.dependencies = [];
export default func;
