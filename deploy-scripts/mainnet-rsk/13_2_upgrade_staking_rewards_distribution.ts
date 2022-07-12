import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { deployContract } from "../../utils/DeploymentHelpers";
import { srdContractName } from "./5_2_staking_rewards_distribution";
import { getDeployer } from "../../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  return await deployContract("Upgrade staking rewards distribution", async () => {
    const deployer = await getDeployer(hre);

    await hre.deployments.deploy(srdContractName, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy"
      },
      contract: srdContractName,
      log: true
    });
  });
};

func.id = __filename;
func.tags = ["StakingRewardsDistribution-Upgrade-V2"];
func.dependencies = ["StakingRewardsDistribution", "Vesting-Upgrade-V2"];
func.skip = (_env: HardhatRuntimeEnvironment) => Promise.resolve(false);
export default func;
