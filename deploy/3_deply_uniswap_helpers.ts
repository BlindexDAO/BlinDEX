import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import * as constants from '../utils/Constatnts'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const deployer = (await hre.getNamedAccounts()).DEPLOYER_ADDRESS;
    const uniswapV2Factory = await hre.deployments.deploy('UniswapV2Factory', {
        from: deployer,
        args: [deployer]
    });    
    
    console.log("UniswapV2Factory deployed to:", uniswapV2Factory.address);

    const uniswapV2Router02 = await hre.deployments.deploy('UniswapV2Router02', {
        from: deployer,
        args: [uniswapV2Factory.address, constants.wETH_address]
    });

    console.log("UniswapV2Router02 deployed to:", uniswapV2Router02.address);

    // One time migration
    return true;
};
func.id = __filename
func.tags = ['UniswapHelpers'];
func.dependencies = [];
export default func;
