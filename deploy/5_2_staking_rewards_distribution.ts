import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';
import { StakingRewardsDistribution } from '../typechain/StakingRewardsDistribution';
import { to_d18 } from '../utils/Helpers'
import { Vesting } from '../typechain/Vesting';

async function feedStakeRewardsDistribution(hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: staking rewards distribution");

  const treasury = await hre.ethers.getNamedSigner("TREASURY");

  const bdx = await hre.ethers.getContract("BDXShares") as BDXShares;
  const stakingRewardsDistribution = await hre.ethers.getContract("StakingRewardsDistribution") as StakingRewardsDistribution;

  await(await bdx.connect(treasury).transfer(
    stakingRewardsDistribution.address,
    to_d18(21).mul(1e6).div(2))).wait();

  console.log("Fed Staking Rewards Distribution");
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const bdx = await hre.ethers.getContract("BDXShares") as BDXShares;
  const vesting = await hre.ethers.getContract('Vesting') as Vesting

  const stakingRewardsDistribution_ProxyDeployment = await hre.deployments.deploy(
    "StakingRewardsDistribution", {
    from: (await hre.getNamedAccounts()).DEPLOYER,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
      execute: {
        init: {
          methodName: "initialize",
          args: [
            bdx.address,
            vesting.address,
            90
          ]
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

  await feedStakeRewardsDistribution(hre);

  console.log("finished deployment: staking rewards distribution");

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['StakingRewardsDistribution'];
func.dependencies = ['BDX', 'BdxMint', "Vesting"];
export default func;