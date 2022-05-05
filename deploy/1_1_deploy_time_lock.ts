import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: Timelock");

  const day = 3600 * 24;

  const deployer = (await hre.getNamedAccounts()).DEPLOYER;
  const timelock = await hre.deployments.deploy("Timelock", {
    from: deployer,
    args: [
      deployer,
      day * 1, // min delay
      day * 30, // max delay
      day * 14, // grace period
      day * 14 // delay
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
