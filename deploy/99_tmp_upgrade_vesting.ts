import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { getDeployer } from "../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: vesting");

  const deployer = await getDeployer(hre);

  const vesting_ProxyDeployment = await hre.deployments.deploy("Vesting", {
    from: deployer.address,
    proxy: {
      proxyContract: "OptimizedTransparentProxy"
    },
    contract: "Vesting",
    args: []
  });

  console.log("Vesting deployed to: " + vesting_ProxyDeployment.address);

  console.log("finished deployment: vesting");

  return true;
};

func.id = __filename;
func.tags = ["Vesting"];
func.dependencies = ["BDX"];
export default func;
