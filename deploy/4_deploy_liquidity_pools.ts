import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import * as constants from '../utils/Constatnts'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const bdx = await hre.deployments.get('BDXShares')
    const bdeur = await hre.deployments.get('BDEUR')

    const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as unknown as UniswapV2Factory;
    await uniswapFactoryContract.createPair(bdx.address, bdeur.address);
    await uniswapFactoryContract.createPair(bdx.address, constants.wETH_address);
    await uniswapFactoryContract.createPair(bdx.address, constants.wBTC_address);

    await uniswapFactoryContract.createPair(bdeur.address, constants.wETH_address);
    await uniswapFactoryContract.createPair(bdeur.address, constants.wBTC_address);

    // One time migration
    return true;
};
func.id = __filename
func.tags = ['LiquidityPools'];
func.dependencies = ['BDX', 'BDEUR', 'BdxMint'];
export default func;