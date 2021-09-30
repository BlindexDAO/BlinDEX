import { BDLens } from './../typechain/BDLens.d';
import { ethers } from 'hardhat';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.ethers.getSigners();
  const lensDeployment = await hre.deployments.deploy(
    'BDLens', 
    {
      from: deployer.address,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: 'initialize',
            args: []
          }
        }
      },
      contract: "BDLens",
      args: []
    });

  const lens = await ethers.getContract('BDLens', deployer) as BDLens
  console.log("BDLens deployed to:", lens.address);

  console.log("BDLens deployed to:", lensDeployment.address);

  await (await lens.setBDX(await (await ethers.getContract('BDXShares')).address))

  console.log(await lens.BDX());

  await lens.pushBdStable(await (await ethers.getContract('BDEU')).address)

  await lens.setSwapFactory(await (await ethers.getContract('UniswapV2Factory')).address)
  await lens.setSwapRouter(await (await ethers.getContract('UniswapV2Router02')).address)

  await lens.setStakingRewardsDistribution(await (await ethers.getContract('StakingRewardsDistribution')).address)

  await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDX_WETH')).address)
  await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDX_BDEU')).address)
  await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDEU_WETH')).address)
  await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDX_WBTC')).address)
  await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDEU_WBTC')).address)

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['LENS'];
func.dependencies = ['PriceFeeds'];
export default func;