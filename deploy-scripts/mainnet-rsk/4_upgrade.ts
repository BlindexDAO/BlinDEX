import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("Upgrading");

  await hre.deployments.deploy("StakingRewards", {
    from: (await hre.getNamedAccounts()).DEPLOYER,
    proxy: {
      proxyContract: "OptimizedTransparentProxy"
    },
    contract: "StakingRewards"
  });

  console.log("Upgraded StakingRewards");

  await hre.deployments.deploy("StakingRewardsDistribution", {
    from: (await hre.getNamedAccounts()).DEPLOYER,
    proxy: {
      proxyContract: "OptimizedTransparentProxy"
    },
    contract: "StakingRewardsDistribution"
  });

  console.log("Upgraded StakingRewardsDistribution");

  await hre.deployments.deploy("Vesting", {
    from: (await hre.getNamedAccounts()).DEPLOYER,
    proxy: {
      proxyContract: "OptimizedTransparentProxy"
    },
    contract: "Vesting"
  });

  console.log("Upgraded vesting");

  console.log("finished deployment: staking rewards");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["Upgrade"];
func.dependencies = ["StakingRewards"];
export default func;
