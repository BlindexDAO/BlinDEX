import { HardhatRuntimeEnvironment } from "hardhat/types";
import { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { BDStable } from "../typechain/BDStable";
import { UniswapV2Factory } from "../typechain/UniswapV2Factory";
import * as constants from "./Constants";

export async function getWethPair(hre: HardhatRuntimeEnvironment, tokenName: string): Promise<UniswapV2Pair> {
    const ownerUser = (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
    const uniswapFactory = await hre.ethers.getContract("UniswapV2Factory", ownerUser) as UniswapV2Factory;
  
    const token = await hre.ethers.getContract(tokenName) as BDStable;
  
    const pairAddress = await uniswapFactory.getPair(token.address, constants.wETH_address[hre.network.name]);
  
    const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;
  
    return pair;
}