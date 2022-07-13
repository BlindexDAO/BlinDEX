import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("Starting deployment of Disperse contract");

  const deployer = (await hre.getNamedAccounts()).DEPLOYER;

  const disperseContract = await hre.deployments.deploy("Disperse", {
    from: deployer
  });

  console.log(`disperse deployed to: ${disperseContract.address}`);

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["Disperse"];
func.dependencies = [];
export default func;
