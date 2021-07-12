import { HardhatRuntimeEnvironment } from "hardhat/types";
import {  numberToBigNumberFixed, to_d18, to_d12, bigNumberToDecimal } from "../../utils/Helpers"
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat"
import { getBdEur, getBdEurWbtcPool, getBdx, getWeth } from "./common"
import { swapForWethAsDeployer, swapWethAsDeployer, updateWethPair } from "./swaps";

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

export async function lockBdEurCrAt(hre: HardhatRuntimeEnvironment, targetCR: number) {
  if(targetCR < 0){
    throw new Error("targetCR must >= 0");
  }

  if(targetCR > 1){
    throw new Error("targetCR must <= 1");
  }

  const bdEur = await getBdEur(hre);

  const currentCR_d12 = await bdEur.global_collateral_ratio_d12();
  const currentCR = bigNumberToDecimal(currentCR_d12, 12);

  let step = Math.abs(targetCR - currentCR); // step is always positive
  let step_d12 = to_d12(step);

  // set step to 1 to get CR = 0 after first refresh
  await bdEur.setBdstable_step_d12(step_d12);

  if(targetCR > currentCR){
    await swapForWethAsDeployer(hre, "BDEUR", 500, 0.0001); // decrease bdeur price (give bdeur, take weth)
  } else {
    await swapWethAsDeployer(hre, "BDEUR", 0.5, 1); // increase bdeur price (give weth, take bdeur)
  }

  await updateBdxOracleRefreshRatiosBdEur(hre);
  await updateBdxOracle(hre);
  
  await bdEur.setBdstable_step_d12(0); // lock CR
}