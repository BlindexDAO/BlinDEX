import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from "hardhat";
import { BDXShares } from '../typechain/BDXShares';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import { StakingRewards } from '../typechain/StakingRewards';
import { BigNumber } from 'ethers';

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"; // todo ag

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.ethers.getSigners();
  
  const bdeur = await hre.deployments.get('BDEUR');
  const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

  const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as unknown as UniswapV2Factory;
  const pairAddress = await uniswapFactoryContract.getPair(bdeur.address, WETH_ADDRESS); 

  const stakingRewards_BDEUR_WETH_ProxyDeployment = await hre.deployments.deploy(
    'StakingRewards_BDEUR_WETH', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
    },
    contract: "StakingRewards",
    args: []
  });

  const stakingRewards_BDEUR_WETH_Proxy = await hre.ethers.getContract("StakingRewards_BDEUR_WETH") as unknown as StakingRewards;

  await stakingRewards_BDEUR_WETH_Proxy.initialize(
    bdx.address,
    pairAddress,
    hre.ethers.constants.AddressZero, //todo ag use actual contract
    1e6,
    false);

  await bdx.connect((await hre.ethers.getNamedSigner("COLLATERAL_FRAX_AND_FXS_OWNER"))).transfer(
  
    stakingRewards_BDEUR_WETH_ProxyDeployment.address,
  BigNumber.from(21).mul(BigNumber.from(10).pow(6+18)).div(2));


  console.log("StakingRewards deployed to:", stakingRewards_BDEUR_WETH_ProxyDeployment.address);

  console.log("Bdx shares connected with StakingRewards");

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['StakingRewards'];
func.dependencies = ['LiquidityPools'];
export default func;