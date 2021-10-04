import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import { StakingRewards } from '../typechain/StakingRewards';
import * as constants from '../utils/Constants'
import { StakingRewardsDistribution } from '../typechain/StakingRewardsDistribution';
import { Timelock } from '../typechain/Timelock';
import { Vesting } from '../typechain/Vesting';

async function setupStakingContract(
  hre: HardhatRuntimeEnvironment,
  addressA: string,
  addressB: string,
  nameA: string,
  nameB: string,
  isTrueBdPool: boolean)
  {
  const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as UniswapV2Factory;
  const pairAddress = await uniswapFactoryContract.getPair(addressA, addressB);

  const stakingRewardsContractName = `StakingRewards_${nameA}_${nameB}`;

  const timelock = await hre.ethers.getContract("Timelock") as Timelock;
  const stakingRewardsDistribution = await hre.ethers.getContract("StakingRewardsDistribution") as StakingRewardsDistribution;
  const vesting = await hre.ethers.getContract('Vesting') as Vesting

  const stakingRewards_ProxyDeployment = await hre.deployments.deploy(
    stakingRewardsContractName, {
    from: (await hre.getNamedAccounts()).DEPLOYER,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
      execute: {
        init: {
          methodName: "initialize",
          args: [
            pairAddress,
            timelock.address,
            stakingRewardsDistribution.address,
            vesting.address,
            isTrueBdPool
          ]
        }
      }
    },
    contract: "StakingRewards",
    args: []
  });

  const deployer = await hre.ethers.getSigner((await hre.getNamedAccounts()).DEPLOYER);

  await (await stakingRewardsDistribution.connect(deployer).registerPools([<string>stakingRewards_ProxyDeployment.address], [1e6])).wait();

  console.log(`${stakingRewardsContractName} deployed to proxy:`, stakingRewards_ProxyDeployment.address);
  console.log(`${stakingRewardsContractName} deployed to impl: `, stakingRewards_ProxyDeployment.implementation);

  if (nameB === 'WETH') {
    console.log('Setting up StakingRewards_BDEU_WETH as vesting scheduler');
    await vesting.connect(deployer).setVestingScheduler(stakingRewards_ProxyDeployment.address);
  }
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkName = hre.network.name;

  const bdeu = await hre.deployments.get('BDEU');
  const bdx = await hre.ethers.getContract("BDXShares") as BDXShares;

  console.log("Setting up staking contracts");

  await setupStakingContract(hre, bdx.address, constants.wETH_address[networkName], "BDX", "WETH", false);
  console.log("Set up statking: BDX/WETH");

  await setupStakingContract(hre, bdx.address, constants.wBTC_address[networkName], "BDX", "WBTC", false);
  console.log("Set up statking: BDX/WBTC");

  await setupStakingContract(hre, bdx.address, bdeu.address, "BDX", "BDEU", true);
  console.log("Set up statking: BDX/BDEU");

  await setupStakingContract(hre, bdeu.address, constants.wETH_address[networkName], "BDEU", "WETH", false);
  console.log("Set up statking: BDEU/WETH");

  await setupStakingContract(hre, bdeu.address, constants.wBTC_address[networkName], "BDEU", "WBTC", false);
  console.log("Set up statking: BDEU/WBTC");

  console.log("Bdx shares connected with StakingRewards");

  // One time migration
  return true;
};
func.id = __filename
func.tags = ['StakingRewards'];
func.dependencies = ['LiquidityPools', 'StakingRewardsDistribution', 'Vesting'];
export default func;