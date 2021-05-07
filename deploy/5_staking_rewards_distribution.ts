import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';
import { StakingRewardsDistribution } from '../typechain/StakingRewardsDistribution';
import { toErc20 } from '../utils/Helpers'

async function feedStakeRewardsDistribution(hre: HardhatRuntimeEnvironment) {
  const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

  const stakingRewardsDistribution = await hre.ethers.getContract("StakingRewardsDistribution") as unknown as StakingRewardsDistribution;

  await bdx.connect((await hre.ethers.getNamedSigner("COLLATERAL_FRAX_AND_FXS_OWNER"))).transfer(
    stakingRewardsDistribution.address,
    toErc20(21).mul(1e6).div(2));

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

  const stakingRewardsDistribution_Proxy = await hre.ethers.getContract("StakingRewardsDistribution") as unknown as StakingRewardsDistribution;
  await stakingRewardsDistribution_Proxy.initialize(
    hre.ethers.constants.AddressZero, //todo ag use actual contract
    bdx.address);

  console.log("Deployed StakingRewardsDistribution");

  await feedStakeRewardsDistribution(hre);

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['StakingRewardsDistribution'];
func.dependencies = ['BDX', 'BdxMint'];
export default func;