import { HardhatRuntimeEnvironment } from "hardhat/types";
import {  numberToBigNumberFixed, to_d18, to_d12, bigNumberToDecimal } from "../../utils/Helpers"
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat"
import { getBdEur, getBdEurWbtcPool, getBdx, getWeth } from "./common"
import { swapForWethAsDeployer, swapWethAsDeployer, updateWethPair } from "./swaps";

const oneHour = 60*60;

export async function updateBdEurOracle(hre: HardhatRuntimeEnvironment){//todo ag needed?
  await simulateTimeElapseInSeconds(oneHour*2);

  await updateWethPair(hre, "BDEUR");
}

export async function updateBdxOracle(hre: HardhatRuntimeEnvironment){//todo ag needed?
  await simulateTimeElapseInSeconds(oneHour*2);

  await updateWethPair(hre, "BDXShares");
}

export async function lockBdEurCrAt(hre: HardhatRuntimeEnvironment, targetCR: number) {
  if(targetCR < 0){
    throw new Error("targetCR must >= 0");
  }

  if(targetCR > 1){
    throw new Error("targetCR must <= 1");
  }

  const bdEur = await getBdEur(hre);
  
  await bdEur.lockCollateralRationAt(to_d12(targetCR));
}