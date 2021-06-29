import { HardhatRuntimeEnvironment } from "hardhat/types";
import { simulateTimeElapseInSeconds, to_d18, d18_ToNumber } from "../../utils/Helpers"
import { getBdEur, getBdx } from "./common"
import { updateWethPair } from "./swaps";
import * as constants from '../../utils/Constants'
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { WETH } from "../../typechain/WETH";
import { BdStablePool } from "../../typechain/BdStablePool";

const oneHour = 60*60;

export async function updateBdxOracleRefreshRatiosBdEur(hre: HardhatRuntimeEnvironment){
  await simulateTimeElapseInSeconds(oneHour*2);

  await updateWethPair(hre, "BDEUR");

  const bdEur = await getBdEur(hre);
  await bdEur.refreshCollateralRatio();
}

export async function updateBdxOracle(hre: HardhatRuntimeEnvironment){
  await simulateTimeElapseInSeconds(oneHour*2);

  await updateWethPair(hre, "BDXShares");
}

export async function perform1To1Minting(hre: HardhatRuntimeEnvironment, user: SignerWithAddress, collateralAmount: number){
  const [ ownerUser ] = await hre.ethers.getSigners();

  const bdEurPool = await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;

  await updateBdxOracleRefreshRatiosBdEur(hre);

  const weth = await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as unknown as WETH;
  await weth.connect(user).deposit({ value: to_d18(1000) });

  await weth.connect(user).approve(bdEurPool.address, to_d18(collateralAmount));
  
  await bdEurPool.connect(user).mint1t1BD((to_d18(collateralAmount)), (to_d18(1)));
}