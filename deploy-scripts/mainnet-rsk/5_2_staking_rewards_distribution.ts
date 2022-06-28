import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import type { StakingRewardsDistribution } from "../../typechain/StakingRewardsDistribution";
import { to_d18 } from "../../utils/NumbersHelpers";
import { getBdx, getTreasuryAddress, getTreasurySigner, getVesting } from "../../utils/DeployedContractsHelpers";

export const srdContractName = "StakingRewardsDistribution";

async function feedStakeRewardsDistribution(hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: staking rewards distribution");

  const treasury = await getTreasurySigner(hre);

  const bdx = await getBdx(hre);
  const stakingRewardsDistribution = (await hre.ethers.getContract(srdContractName)) as StakingRewardsDistribution;

  // For RSK we were able to do this because back then the treasury wasn't in a multisig
  await (await bdx.connect(treasury).transfer(stakingRewardsDistribution.address, to_d18(21).mul(1e6).div(2))).wait();

  console.log("Fed Staking Rewards Distribution");
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const bdx = await getBdx(hre);
  const vesting = await getVesting(hre);
  const treasuryAddress = await getTreasuryAddress(hre);

  const stakingRewardsDistribution_ProxyDeployment = await hre.deployments.deploy(srdContractName, {
    from: (await hre.getNamedAccounts()).DEPLOYER,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [bdx.address, vesting.address, treasuryAddress, 90]
        }
      }
    },
    contract: srdContractName,
    args: []
  });

  console.log("Deployed StakingRewardsDistribution: " + stakingRewardsDistribution_ProxyDeployment.address);

  // there is cycle dependency between staking rewards distribution and vesting
  // once staking rewards distribution is available we override vesting params

  await (await vesting.setFundsProvider(stakingRewardsDistribution_ProxyDeployment.address)).wait();
  console.log("set funds provider");

  await (await vesting.setVestingScheduler(stakingRewardsDistribution_ProxyDeployment.address)).wait();
  console.log("set set vesting scheduler");

  await feedStakeRewardsDistribution(hre);

  console.log("finished deployment: staking rewards distribution");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["StakingRewardsDistribution"];
func.dependencies = ["BDX", "BdxMint", "Vesting"];
export default func;
