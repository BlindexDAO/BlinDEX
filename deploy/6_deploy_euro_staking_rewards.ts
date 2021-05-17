import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import { StakingRewards } from '../typechain/StakingRewards';
import { BigNumber } from 'ethers';
import * as constants from '../utils/Constants'
import { StakingRewardsDistribution } from '../typechain/StakingRewardsDistribution';
import { Timelock } from '../typechain/TimeLock';

async function feedStakeRewards(hre: HardhatRuntimeEnvironment, nameA: string, nameB: string) {
  const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

  const contractName = `StakingRewards_${nameA}_${nameB}`;

  const stakingRewards_BDEUR_WETH_Proxy = await hre.ethers.getContract(
    contractName) as unknown as StakingRewards;

  await (await bdx.connect((await hre.ethers.getNamedSigner("COLLATERAL_FRAX_AND_FXS_OWNER"))).transfer(
    stakingRewards_BDEUR_WETH_Proxy.address,
    BigNumber.from(21).mul(BigNumber.from(10).pow(6 + 18)).div(2).div(constants.numberOfLPs))).wait();

  console.log("Fed Staking Rewards: " + contractName);
}

async function setupStakingContract(
  hre: HardhatRuntimeEnvironment,
  addressA: string,
  addressB: string,
  nameA: string,
  nameB: string,
  isTrueBdPool: boolean)
{
  const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as unknown as UniswapV2Factory;
  const pairAddress = await uniswapFactoryContract.getPair(addressA, addressB); 

  const stakingRewardsContractName = `StakingRewards_${nameA}_${nameB}`;

  const stakingRewards_ProxyDeployment = await hre.deployments.deploy(
    stakingRewardsContractName, {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
    },
    contract: "StakingRewards",
    args: []
  });

  const stakingRewardsDistribution = await hre.ethers.getContract("StakingRewardsDistribution") as unknown as StakingRewardsDistribution;
  const stakingRewards_Proxy = await hre.ethers.getContract(stakingRewardsContractName) as unknown as StakingRewards;

  const [ deployer ] = await hre.ethers.getSigners();

  const timelock = await hre.ethers.getContract("Timelock") as unknown as Timelock;

  await stakingRewards_Proxy.initialize(
    pairAddress,
    timelock.address,
    stakingRewardsDistribution.address,
    isTrueBdPool);

  stakingRewardsDistribution.connect(deployer).registerPools([<string>stakingRewards_ProxyDeployment.address], [1e6]);

  console.log(`${stakingRewardsContractName} deployed to proxy:`, stakingRewards_ProxyDeployment.address);
  console.log(`${stakingRewardsContractName} deployed to impl: `, stakingRewards_ProxyDeployment.implementation);
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkName = ['rinkeby', 'kovan'].includes(hre.network.name) ?hre.network.name as 'rinkeby' | 'kovan'  : 'mainnet';
  const [ deployer ] = await hre.ethers.getSigners();
  
  const bdeur = await hre.deployments.get('BDEUR');
  const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

  //todo ag set true pools rewards proportions

  console.log("Setting up staking contracts");

  await setupStakingContract(hre, bdx.address, constants.wETH_address[networkName], "BDX", "WETH", false);
  console.log("Set up statking: BDX/WETH");

  await setupStakingContract(hre, bdx.address, constants.wBTC_address[networkName], "BDX", "WBTC", false);
  console.log("Set up statking: BDX/WBTC");

  await setupStakingContract(hre, bdx.address, bdeur.address, "BDX", "BDEUR", true);
  console.log("Set up statking: BDX/BDEUR");

  await setupStakingContract(hre, bdeur.address, constants.wETH_address[networkName], "BDEUR", "WETH", false);
  console.log("Set up statking: BDEUR/WETH");

  await setupStakingContract(hre, bdeur.address, constants.wBTC_address[networkName], "BDEUR", "WBTC", false);
  console.log("Set up statking: BDEUR/WBTC");

  console.log("Bdx shares connected with StakingRewards");

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['StakingRewards'];
func.dependencies = ['LiquidityPools', 'StakingRewardsDistribution'];
export default func;