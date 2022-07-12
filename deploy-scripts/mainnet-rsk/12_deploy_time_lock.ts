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
      deployer,
      day * 1, // min delay
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
func.skip = (_env: HardhatRuntimeEnvironment) => Promise.resolve(process.env.NODE_ENV !== "test"); // Only enable it in testing mode
export default func;
