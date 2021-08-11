import { HardhatRuntimeEnvironment } from "hardhat/types";
import { to_d18, to_d12 } from "../../utils/Helpers"
import { getBdEur, getBdEurWbtcPool, getBdx, getWeth } from "./common"


const oneHour = 60*60;

export async function lockBdEurCrAt(hre: HardhatRuntimeEnvironment, targetCR: number) {
  if(targetCR < 0){
    throw new Error("targetCR must >= 0");
  }

  if(targetCR > 1){
    throw new Error("targetCR must <= 1");
  }

  const bdEur = await getBdEur(hre);
  
  await bdEur.lockCollateralRatioAt(to_d12(targetCR));
}