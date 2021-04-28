import {HardhatRuntimeEnvironment} from 'hardhat/types';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import { UniswapPairOracle } from '../typechain/UniswapPairOracle';
import * as constants from '../utils/Constatnts'

export async function deployUniswapOracle(hre: HardhatRuntimeEnvironment, tokenAddress: string, tokenName: string) : Promise<string> {
  const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as unknown as UniswapV2Factory;
  
  const contractName = `UniswapPairOracle_${tokenName}_WETH`;
  
  const deploymentResult = await hre.deployments.deploy(contractName, {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "UniswapPairOracle",
    args: [
      uniswapFactoryContract.address,
      tokenAddress,
      constants.wETH_address,
      (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
      hre.ethers.constants.AddressZero, //todo ag use actual contract
    ]
  });

  console.log(`Deplyed ${contractName} at ${deploymentResult.address}`);

  return deploymentResult.address;
}