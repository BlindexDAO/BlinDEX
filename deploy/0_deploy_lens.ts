import { BDLens } from './../typechain/BDLens.d';
import { ethers } from 'hardhat';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import * as constants from '../utils/Constants'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: BDLens");

  const deployer = (await hre.getNamedAccounts()).DEPLOYER;
  const lensDeployment = await hre.deployments.deploy(
    'BDLens', 
    {
      from: deployer,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: 'initialize',
            args: [constants.NATIVE_TOKEN_NAME[hre.network.name]]
          }
        }
      },
      contract: "BDLens",
      args: []
    });

  const lens = await ethers.getContract('BDLens', deployer) as BDLens
  console.log("BDLens deployed to:", lens.address);

  await (await (await lens.setBDX(await (await ethers.getContract('BDXShares')).address)).wait())
  console.log("BDLENS bdx set");

  await (await lens.pushBdStable(await (await ethers.getContract('BDEU')).address)).wait();
  console.log("BDLENS bdeu set");

  await (await lens.setSwapFactory(await (await ethers.getContract('UniswapV2Factory')).address)).wait()
  console.log("BDLENS uniswap factory set");

  await (await lens.setSwapRouter(await (await ethers.getContract('UniswapV2Router02')).address)).wait()
  console.log("BDLENS uniswap router set");

  await (await lens.setStakingRewardsDistribution(await (await ethers.getContract('StakingRewardsDistribution')).address)).wait()
  console.log("BDLENS staking rewards ditribution set");

  await (await lens.setVesting(await (await ethers.getContract('Vesting')).address)).wait()
  console.log("BDLENS vesting set");

  await (await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDX_WETH')).address)).wait()
  console.log("BDLENS bdx weth staking pushed");

  await (await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDX_BDEU')).address)).wait()
  console.log("BDLENS bdx bdeu staking pushed");

  await (await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDEU_WETH')).address)).wait()
  console.log("BDLENS bdeu weth staking pushed");

  await (await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDX_WBTC')).address)).wait()
  console.log("BDLENS bdx wbtc staking pushed");

  await (await lens.pushStaking(await (await ethers.getContract('StakingRewards_BDEU_WBTC')).address)).wait()
  console.log("BDLENS bdeu wbtc staking set");

  await (await lens.setPriceFeed_EUR_USD(await (await ethers.getContract('PriceFeed_EUR_USD')).address)).wait()
  console.log("BDLENS eur usd feed set");
  
  console.log("finished deployment: BDLens");

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['LENS'];
func.dependencies = ['PriceFeeds'];
export default func;
