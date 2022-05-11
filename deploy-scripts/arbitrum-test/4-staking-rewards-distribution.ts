import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../../utils/Constants";
import { getBdx, getDeployer, getVesting } from "../../utils/DeployedContractsHelpers";
import { deployContract, printAndWaitOnTransaction } from "../../utils/DeploymentHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  return await deployContract("StakingRewardsDistribution", async () => {
    const bdx = await getBdx(hre);
    const vesting = await getVesting(hre);
    const deployer = await getDeployer(hre);
    const treasuryAddress = constants.treasuryAddresses[hre.network.name];

    const vestingRewardRatioPercent = 90;

    const stakingRewardsDistribution_ProxyDeployment = await hre.deployments.deploy("StakingRewardsDistribution", {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        execute: {
          init: {
            methodName: "initialize",
            args: [bdx.address, vesting.address, treasuryAddress, vestingRewardRatioPercent]
          }
        }
      },
      contract: "StakingRewardsDistribution",
      args: []
    });

    console.log("Deployed StakingRewardsDistribution: " + stakingRewardsDistribution_ProxyDeployment.address);

    // there is cycle dependency between staking rewards distribution and vesting
    // once staking rewards distribution is available we override vesting params

    console.log("Settings the funds provider");
    await printAndWaitOnTransaction(await vesting.setFundsProvider(stakingRewardsDistribution_ProxyDeployment.address));

    console.log("Setting the vesting scheduler");
    await printAndWaitOnTransaction(await vesting.setVestingScheduler(stakingRewardsDistribution_ProxyDeployment.address));
  });
};

func.id = __filename;
func.tags = ["StakingRewardsDistribution"];
func.dependencies = ["BDX", "Vesting"];

export default func;
