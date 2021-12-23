import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: Timelock");

  const deployer = (await hre.getNamedAccounts()).DEPLOYER;
  const timelock = await hre.deployments.deploy("Timelock", {
    from: deployer,
    args: [
      deployer,
      60 * 60 * 24 * 14 // 2 weeks delay
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
