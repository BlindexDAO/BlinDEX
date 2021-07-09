import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';
import { StakingRewardsDistribution } from '../typechain/StakingRewardsDistribution';
import { to_d18 } from '../utils/Helpers'
import { Timelock } from '../typechain/Timelock';

async function feedStakeRewardsDistribution(hre: HardhatRuntimeEnvironment) {
  const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

  const stakingRewardsDistribution = await hre.ethers.getContract("StakingRewardsDistribution") as unknown as StakingRewardsDistribution;

  const treasury = await hre.ethers.getNamedSigner("COLLATERAL_FRAX_AND_FXS_OWNER");

  await bdx.connect(treasury).transfer(
    stakingRewardsDistribution.address,
    to_d18(21).mul(1e6).div(2));

  console.log("Fed Staking Rewards Distribution");
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.ethers.getSigners();
  
  const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

  const stakingRewardsDistribution_ProxyDeployment = await hre.deployments.deploy(
    "StakingRewardsDistribution", {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
    },
    contract: "StakingRewardsDistribution",
    args: []
  });

  const timelock = await hre.ethers.getContract("Timelock") as unknown as Timelock;

  const stakingRewardsDistribution_Proxy = await hre.ethers.getContract("StakingRewardsDistribution") as unknown as StakingRewardsDistribution;
  await stakingRewardsDistribution_Proxy.initialize(
    timelock.address,
    bdx.address);

  console.log("Deployed StakingRewardsDistribution");

  await feedStakeRewardsDistribution(hre);

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['StakingRewardsDistribution'];
func.dependencies = ['BDX', 'BdxMint', 'Timelock'];
export default func;