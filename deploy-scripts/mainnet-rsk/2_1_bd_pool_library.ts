import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: bdPoolLibrary");

  const deployer = (await hre.getNamedAccounts()).DEPLOYER;

  await hre.deployments.deploy("BdPoolLibrary", {
    from: deployer
  });

  console.log("finished deployment: bdPoolLibrary");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["BdPoolLibrary"];
func.dependencies = ["BDX", "BdxMint"];
export default func;
