import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { getBdx, getDeployer } from "../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: fix vesting");

  const deployer = await getDeployer(hre);
  const bdx = await getBdx(hre);
  const vestingTimeInSeconds = 60 * 60 * 24 * 30 * 9; //9 months

  // redeploy
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

  // upgrade
  const stakingRewardsDistribution_ProxyDeployment = await hre.deployments.deploy("StakingRewardsDistribution", {
    from: (await hre.getNamedAccounts()).DEPLOYER,
    proxy: {
      proxyContract: "OptimizedTransparentProxy"
    },
    contract: "StakingRewardsDistribution",
    args: []
  });

  console.log("Deployed StakingRewardsDistribution: " + stakingRewardsDistribution_ProxyDeployment.address);

  const srd = await hre.ethers.getContractAt("StakingRewardsDistribution", stakingRewardsDistribution_ProxyDeployment.address);
  await (await srd.setVesting(vesting_ProxyDeployment.address)).wait();

  const vesting = await hre.ethers.getContractAt("Vesting", vesting_ProxyDeployment.address);

  await (await vesting.setFundsProvider(stakingRewardsDistribution_ProxyDeployment.address)).wait();
  console.log("Setting the funds provider for the Vesting contract");

  await (await vesting.setVestingScheduler(stakingRewardsDistribution_ProxyDeployment.address)).wait();
  console.log("Setting the vesting scheduler");

  console.log("finished deployment: fix vesting");

  return true;
};

func.id = __filename;
func.tags = [];
func.dependencies = [];
export default func;
