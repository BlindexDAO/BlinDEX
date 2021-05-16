import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from "hardhat";
import { BDXShares } from '../typechain/BDXShares';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import { StakingRewards } from '../typechain/StakingRewards';
import { BigNumber } from 'ethers';
import * as constants from '../utils/Constants'

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
  addressBdx: string,
  nameA: string,
  nameB: string,
  poolFraction_1e6: BigNumber,
  isTrueBdPool: boolean)
{
  const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as unknown as UniswapV2Factory;
  const pairAddress = await uniswapFactoryContract.getPair(addressA, addressB); 

  const stakingRewards_ProxyDeployment = await hre.deployments.deploy(
    `StakingRewards_${nameA}_${nameB}`, {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
    },
    contract: "StakingRewards",
    args: []
  });

  const stakingRewards_Proxy = await hre.ethers.getContract(`StakingRewards_${nameA}_${nameB}`) as unknown as StakingRewards;

  await (await stakingRewards_Proxy.initialize(
    addressBdx,
    pairAddress,
    hre.ethers.constants.AddressZero,
    poolFraction_1e6,
    isTrueBdPool)).wait();

  console.log(`StakingRewards (${nameA}/${nameB}) deployed to:`, stakingRewards_ProxyDeployment.address);

  await feedStakeRewards(hre, nameA, nameB);
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkName = ['rinkeby', 'kovan'].includes(hre.network.name) ?hre.network.name as 'rinkeby' | 'kovan'  : 'mainnet';
  const [ deployer ] = await hre.ethers.getSigners();
  
  const bdeur = await hre.deployments.get('BDEUR');
  const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

  //todo ag set true pools rewards proportions

  const poolFraction = BigNumber.from(1e6).div(constants.numberOfLPs);

  console.log("Setting up staking contracts");

  await setupStakingContract(hre, bdx.address, constants.wETH_address[networkName], bdx.address, "BDX", "WETH", poolFraction, false);
  console.log("Set up staking: BDX/WETH");

  await setupStakingContract(hre, bdx.address, constants.wBTC_address[networkName], bdx.address, "BDX", "WBTC", poolFraction, false);
  console.log("Set up staking: BDX/WBTC");

  await setupStakingContract(hre, bdx.address, bdeur.address, bdx.address, "BDX", "BDEUR", poolFraction, true);
  console.log("Set up staking: BDX/BDEUR");

  await setupStakingContract(hre, bdeur.address, constants.wETH_address[networkName], bdx.address, "BDEUR", "WETH", poolFraction, false);
  console.log("Set up staking: BDEUR/WETH");

  await setupStakingContract(hre, bdeur.address, constants.wBTC_address[networkName], bdx.address, "BDEUR", "WBTC", poolFraction, false);
  console.log("Set up staking: BDEUR/WBTC");

  console.log("Bdx shares connected with StakingRewards");

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['StakingRewards'];
func.dependencies = ['LiquidityPools'];
export default func;