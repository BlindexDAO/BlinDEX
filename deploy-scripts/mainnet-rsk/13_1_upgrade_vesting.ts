import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { getDeployer } from "../../utils/DeployedContractsHelpers";
import { deployContract } from "../../utils/DeploymentHelpers";
import { vestingContractName } from "./5_1_deploy_vesting";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  return await deployContract("Upgrade vesting", async () => {
    const deployer = await getDeployer(hre);

    await hre.deployments.deploy(vestingContractName, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy"
      },
      contract: vestingContractName,
      args: []
    });
  });
};

func.id = __filename;
func.tags = ["Vesting-Upgrade-V2"];
func.dependencies = ["Vesting"];
func.skip = (_env: HardhatRuntimeEnvironment) => Promise.resolve(true);
export default func;
