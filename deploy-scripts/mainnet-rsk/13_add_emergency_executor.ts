import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, bdStablesContractsDetails } from "../../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: introduce emergency executor");

  const deployer = await getDeployer(hre);

  const initialDeployBDStables = Object.values(bdStablesContractsDetails).filter(stableDetails =>
    ["BDEU", "BDUS", "bXAU", "bGBP"].includes(stableDetails.symbol)
  );
  for (const stableDetails of initialDeployBDStables) {
    await hre.deployments.deploy(stableDetails.symbol, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy"
      },
      contract: "BDStable"
    });
  }

  console.log("finished deployment: introduce emergency executor");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["EmergencyExecutor"];
func.dependencies = ["Timelock"];
export default func;
