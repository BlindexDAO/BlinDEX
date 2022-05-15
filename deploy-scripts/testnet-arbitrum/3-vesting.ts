import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { getBdx, getDeployer } from "../../utils/DeployedContractsHelpers";
import { deployContract } from "../../utils/DeploymentHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  return await deployContract("Vesting", async () => {
    const deployer = await getDeployer(hre);
    const bdx = await getBdx(hre);
    const vestingTimeInSeconds = 60 * 60 * 24 * 30 * 9; // 9 months

    const vesting_ProxyDeployment = await hre.deployments.deploy("Vesting", {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        execute: {
          init: {
            methodName: "initialize",
            args: [bdx.address, deployer.address, deployer.address, vestingTimeInSeconds]
          }
        }
      },
      contract: "Vesting",
      args: []
    });

    console.log("Vesting deployed to: " + vesting_ProxyDeployment.address);
  });
};

func.id = __filename;
func.tags = ["Vesting"];
func.dependencies = ["BDX"];

export default func;
