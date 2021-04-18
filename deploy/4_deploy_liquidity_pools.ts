import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import { UniswapV2Router02 } from '../typechain/UniswapV2Router02';
import { LiquidityRewardsManager } from '../typechain/LiquidityRewardsManager';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"; // todo ag

    const deployer = (await hre.getNamedAccounts()).DEPLOYER_ADDRESS;
    const uniswapV2Factory = await hre.deployments.deploy('UniswapV2Factory', {
        from: deployer,
        args: [deployer]
    });    
    
    const uniswapV2Router02 = await hre.deployments.deploy('UniswapV2Router02', {
        from: deployer,
        args: [uniswapV2Factory.address, WETH_ADDRESS]
    });

    console.log("UniswapV2Factory deployed to:", uniswapV2Factory.address);

    const bdeur = await hre.deployments.get('BDEUR')

    const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as unknown as UniswapV2Factory;
    await uniswapFactoryContract.createPair(bdeur.address, WETH_ADDRESS)

    // One time migration
    return true;
};
func.id = __filename
func.tags = ['LiquidityPools'];
func.dependencies = ['BdxMint'];
export default func;