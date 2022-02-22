import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { StakingRewards } from "../typechain/StakingRewards";
import { getDeployer, getAllBDStableStakingRewards, getStakingRewardsDistribution, formatAddress } from "../utils/DeployedContractsHelpers";
import { bigNumberToDecimal } from "../utils/NumbersHelpers";

export function load() {
  task("staking:single:unlock")
    .addPositionalParam("stakingRewardAddress", "Staking reward pool contract address")
    .setAction(async ({ stakingRewardAddress }, hre) => {
      const deployer = await getDeployer(hre);
      const stakingRewardContract = (await hre.ethers.getContractAt("StakingRewards", stakingRewardAddress)) as StakingRewards;

      const unlockStakes = await stakingRewardContract.unlockedStakes();
      console.log(`Unlock stakes status before update: ${unlockStakes} (If true, all locked stakes are unlocked)`);
      if (!unlockStakes) {
        await (await stakingRewardContract.connect(deployer).toggleUnlockStakes()).wait();
        console.log(`Unlock stakes status after update: ${await stakingRewardContract.unlockedStakes()}`);
      }
    });

  task("staking:single:lock")
    .addPositionalParam("stakingRewardAddress", "Staking reward pool contract address")
    .setAction(async ({ stakingRewardAddress }, hre) => {
      const deployer = await getDeployer(hre);
      const stakingRewardContract = (await hre.ethers.getContractAt("StakingRewards", stakingRewardAddress)) as StakingRewards;

      const unlockStakes = await stakingRewardContract.unlockedStakes();
      console.log(`Unlock stakes status before update: ${unlockStakes} (If true, all locked stakes are unlocked)`);
      if (unlockStakes) {
        await (await stakingRewardContract.connect(deployer).toggleUnlockStakes()).wait();
        console.log(`Unlock stakes status after update: ${await stakingRewardContract.unlockedStakes()}`);
      }
    });

  task("staking:single:pause")
    .addPositionalParam("stakingRewardAddress", "Staking reward pool contract address")
    .setAction(async ({ stakingRewardAddress }, hre) => {
      const deployer = await getDeployer(hre);
      const stakingRewardContract = (await hre.ethers.getContractAt("StakingRewards", stakingRewardAddress)) as StakingRewards;
      if (!(await stakingRewardContract.connect(deployer).paused())) {
        await (await stakingRewardContract.pause()).wait();
        console.log(`StakingPool ${stakingRewardAddress} is now paused!`);
      } else {
        console.log(`StakingPool ${stakingRewardAddress} is already paused`);
      }
    });

  task("staking:single:unpause")
    .addPositionalParam("stakingRewardAddress", "Staking reward pool contract address")
    .setAction(async ({ stakingRewardAddress }, hre) => {
      const deployer = await getDeployer(hre);
      const stakingRewardContract = (await hre.ethers.getContractAt("StakingRewards", stakingRewardAddress)) as StakingRewards;
      if (await stakingRewardContract.connect(deployer).paused()) {
        await (await stakingRewardContract.unpause()).wait();
        console.log(`StakingPool ${stakingRewardAddress} is now unpaused!`);
      } else {
        console.log(`StakingPool ${stakingRewardAddress} is already unpaused`);
      }
    });

  task("staking:all:pause").setAction(async (args, hre) => {
    const stakings = await getAllBDStableStakingRewards(hre);
    for (const staking of stakings) {
      if (!(await staking.paused())) {
        await staking.pause();
        console.log("paused", staking.address);
      } else {
        console.log("already paused", staking.address);
      }
    }
  });

  task("staking:all:unpause").setAction(async (args, hre) => {
    const stakings = await getAllBDStableStakingRewards(hre);
    for (const staking of stakings) {
      if (await staking.paused()) {
        const transaction = await staking.unpause();
        console.log(`Unpause transaction submitted: ${transaction.hash}. Waiting for it to finish.`);
        await transaction.wait();
        console.log("unpaused", staking.address);
      } else {
        console.log("already unpaused", staking.address);
      }
    }
  });

  task("staking:show-paused").setAction(async (args, hre) => {
    const stakings = await getAllBDStableStakingRewards(hre);
    for (const staking of stakings) {
      console.log(`staking: ${staking.address}`, await staking.paused());
    }
  });

  task("stakings:show-weights").setAction(async (args, hre) => {
    const srd = await getStakingRewardsDistribution(hre);
    const stakings = await getAllBDStableStakingRewards(hre);

    for (const staking of stakings) {
      console.log(`staking: ${staking.address} weight: `, (await srd.stakingRewardsWeights(staking.address)).toString());
    }
  });

  task("staking:update-weight")
    .addPositionalParam("poolAddress", "Pool to update addresss")
    .addPositionalParam("newWeight", "New pool weight")
    .setAction(async ({ poolAddress, newWeight }, hre) => {
      const rewardsBeforeCollect = await getStakingPoolsRewardPerToken(hre);
      console.log("Rewards before sync", rewardsBeforeCollect);

      const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
      const numberOfStakingPools = rewardsBeforeCollect.length;
      await (await stakingRewardsDistribution.collectAllRewards(0, numberOfStakingPools)).wait();

      const rewardsAfterCollect = await getStakingPoolsRewardPerToken(hre);
      console.log("Rewards after sync", rewardsAfterCollect);

      const isStakingPoolsSynced = !rewardsAfterCollect.some((reward, i) => reward.lastUpdateTime <= rewardsBeforeCollect[i].lastUpdateTime);
      console.log("Are all staking pools synced?", isStakingPoolsSynced);

      if (isStakingPoolsSynced) {
        await (await stakingRewardsDistribution.registerPools([poolAddress], [newWeight])).wait();
      }
    });

  task("staking:show-rewards-earned")
    .addPositionalParam("address", "The address to check the rewards for")
    .setAction(async ({ address }, hre) => {
      const stakings = await getAllBDStableStakingRewards(hre);

      let totalBDXRewards = 0;
      for (const staking of stakings) {
        const rewards = bigNumberToDecimal(await staking.earned(formatAddress(hre, address)), 18);
        totalBDXRewards += rewards;
        console.log(`Pool - ${staking.address} - Rewards for address ${address}`, rewards);
      }

      console.log("Total rewards", totalBDXRewards);
    });

  async function getStakingPoolsRewardPerToken(
    hre: HardhatRuntimeEnvironment
  ): Promise<{ address: string; rewardPerTokenStored: string; lastUpdateTime: Date }[]> {
    const stakingRewards = await getAllBDStableStakingRewards(hre);
    return Promise.all(
      stakingRewards.map(async stakingReward => ({
        address: stakingReward.address,
        rewardPerTokenStored: (await stakingReward.rewardPerTokenStored_REWARD_PRECISION()).toString(),
        lastUpdateTime: new Date((await stakingReward.lastUpdateTime()).toNumber() * 1000)
      }))
    );
  }
}
