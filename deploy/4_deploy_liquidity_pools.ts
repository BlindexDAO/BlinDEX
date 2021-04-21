import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import * as constants from '../utils/Constatnts'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const deployer = (await hre.getNamedAccounts()).DEPLOYER_ADDRESS;
    const uniswapV2Factory = await hre.deployments.deploy('UniswapV2Factory', {
        from: deployer,
        args: [deployer]
    });    
    
    const uniswapV2Router02 = await hre.deployments.deploy('UniswapV2Router02', {
        from: deployer,
        args: [uniswapV2Factory.address, constants.wETH_address]
    });

    console.log("UniswapV2Factory deployed to:", uniswapV2Factory.address);

    const bdeur = await hre.deployments.get('BDEUR')

    const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as unknown as UniswapV2Factory;
    await uniswapFactoryContract.createPair(bdeur.address, constants.wETH_address)

    // One time migration
    return true;
};
func.id = __filename
func.tags = ['LiquidityPools'];
func.dependencies = ['BdxMint'];
export default func;