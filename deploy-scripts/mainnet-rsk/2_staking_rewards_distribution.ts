import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getTreasurySigner, getVesting } from "../../utils/DeployedContractsHelpers";

const bdxAddress = "0x6542a10E68cEAc1Fa0641ec0D799a7492795AAC1";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const vesting = await getVesting(hre);
  const devTreasuryAddress = (await getTreasurySigner(hre)).address;

  const stakingRewardsDistribution_ProxyDeployment = await hre.deployments.deploy("StakingRewardsDistribution", {
    from: (await hre.getNamedAccounts()).DEPLOYER,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [bdxAddress, vesting.address, devTreasuryAddress, 90]
        }
      }
    },
    contract: "StakingRewardsDistribution",
    args: []
  });

  console.log("Deployed StakingRewardsDistribution: " + stakingRewardsDistribution_ProxyDeployment.address);

  // there is cycle dependency between staking rewards distribution and vesting
  // once staking rewards distribution is available we override vesting params

  await (await vesting.setFundsProvider(stakingRewardsDistribution_ProxyDeployment.address)).wait();
  console.log("set funds provider");

  await (await vesting.setVestingScheduler(stakingRewardsDistribution_ProxyDeployment.address)).wait();
  console.log("set set vesting scheduler");

  console.log("finished deployment: staking rewards distribution");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["StakingRewardsDistribution"];
func.dependencies = ["Vesting"];
export default func;
