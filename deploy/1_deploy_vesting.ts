import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { getDeployer } from "../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: vesting");

  const deployer = await getDeployer(hre);
  const bdxAddress = "0x6542a10E68cEAc1Fa0641ec0D799a7492795AAC1";
  const vestingTimeInSeconds = 60 * 60 * 24 * 30 * 9; //9 months

  const vesting_ProxyDeployment = await hre.deployments.deploy("Vesting", {
    from: deployer.address,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [bdxAddress, deployer.address, deployer.address, vestingTimeInSeconds]
        }
      }
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
func.dependencies = [];
export default func;
