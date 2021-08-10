import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import * as constants from '../utils/Constants'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const bdx = await hre.deployments.get('BDXShares')
    const bdeur = await hre.deployments.get('BDEUR')

    const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as UniswapV2Factory;
    await (await uniswapFactoryContract.createPair(bdx.address, bdeur.address)).wait();
    await (await uniswapFactoryContract.createPair(bdx.address, constants.wETH_address[hre.network.name])).wait();
    await (await uniswapFactoryContract.createPair(bdx.address, constants.wBTC_address[hre.network.name])).wait();

    await (await uniswapFactoryContract.createPair(bdeur.address, constants.wETH_address[hre.network.name])).wait();
    await (await uniswapFactoryContract.createPair(bdeur.address, constants.wBTC_address[hre.network.name])).wait();

    // One time migration
    return true;
};
func.id = __filename
func.tags = ['LiquidityPools'];
func.dependencies = ['BDX', 'BDEUR', 'BdxMint', 'UniswapHelpers'];
export default func;