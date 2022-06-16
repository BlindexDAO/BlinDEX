import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import {
  getDeployer,
  bdStablesContractsDetails,
  getStakingRewardsDistribution,
  getExecutor,
  getAllBdStables,
  getVesting
} from "../../utils/DeployedContractsHelpers";
import { BdStablePool, StakingRewards } from "../../typechain";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("Starting deployment: set emergency executor");

  const emergencyExecutor = await getExecutor(hre);

  const deployer = await getDeployer(hre);

  const stables = await getAllBdStables(hre);
  for (const stable of stables) {
    console.log(`Setting emergency executor for stable: ${stable.address}`);
    await (await stable.setEmergencyExecutor(emergencyExecutor.address)).wait();
  }

  const initialDeployBDStables = Object.values(bdStablesContractsDetails);
  for (const stableDetails of initialDeployBDStables) {
    for (const poolName of [stableDetails.pools.weth.name, stableDetails.pools.wbtc.name]) {
      console.log(`Setting emergency executor for bdStablePool: ${poolName}`);

      const pool = (await hre.ethers.getContract(stableDetails.symbol, deployer)) as BdStablePool;
      await (await pool.setEmergencyExecutor(emergencyExecutor.address)).wait();
    }
  }

  console.log("Setting emergency executor for vesting");
  const vesting = await getVesting(hre);
  await (await vesting.setEmergencyExecutor(emergencyExecutor.address)).wait();

  console.log("Setting emergency executor for staking rewards distribution");
  const srd = await getStakingRewardsDistribution(hre);
  await (await srd.setEmergencyExecutor(emergencyExecutor.address)).wait();

  const stakingRewardsNo = (await srd.getStakingRewardsAddressesLength()).toNumber();
  for (let i = 0; i < stakingRewardsNo; i++) {
    const address = await srd.stakingRewardsAddresses(i);
    console.log(`Setting emergency executor for staking rewards: ${address}`);

    const stakingRewards = (await hre.ethers.getContractAt("StakingRewards", address, deployer)) as StakingRewards;

    await (await stakingRewards.setEmergencyExecutor(emergencyExecutor.address)).wait();
  }

  console.log(`Upgrading vesting`);
  await hre.deployments.deploy("Vesting", {
    from: deployer.address,
    proxy: {
      proxyContract: "OptimizedTransparentProxy"
    },
    contract: "Vesting"
  });

  console.log("finished deployment: introduce emergency executor");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["EmergencyExecutor"];
func.dependencies = ["Timelock"];
export default func;
