import { BDLens } from './../typechain/BDLens.d';
import { ethers } from 'hardhat';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.ethers.getSigners();
  const lensDeployment = await hre.deployments.deploy('BDLens', {
    from: deployer.address,
    args: [],
    deterministicDeployment: true
  });
  const lens = await ethers.getContract('BDLens', deployer) as BDLens
  console.log("BDLens deployed to:", lens.address);

  // await hre.ethernal.push({
  //     name: 'BDLens',
  //     address: lensDeployment.address
  // });
  console.log("BDLens deployed to:", lensDeployment.address);
  await (await lens.setBDX(await (await ethers.getContract('BDXShares')).address)).wait()

  console.log(await lens.BDX());

  await (await lens.pushBdStable(await (await ethers.getContract('BDEU')).address)).wait()

  await (await lens.setSwapFactory(await (await ethers.getContract('UniswapV2Factory')).address)).wait()
  await (await lens.setSwapRouter(await (await ethers.getContract('UniswapV2Router02')).address)).wait()

  await (await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDX_WETH')).address)).wait()
  await (await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDX_BDEU')).address)).wait()
  await (await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDEU_WETH')).address)).wait()
  await (await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDX_WBTC')).address)).wait()
  await (await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDEU_WBTC')).address)).wait()
	// One time migration
	return true;
};
func.id = __filename
func.tags = ['LENS'];
func.dependencies = ['PriceFeeds'];
export default func;