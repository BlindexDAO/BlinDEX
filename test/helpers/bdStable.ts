import { HardhatRuntimeEnvironment } from "hardhat/types";
import { to_d18, to_d12 } from "../../utils/Helpers"
import { getBdEu, getBdEuWbtcPool, getBdx, getWeth } from "./common"


const oneHour = 60*60;

export async function lockBdEuCrAt(hre: HardhatRuntimeEnvironment, targetCR: number) {
  if(targetCR < 0){
    throw new Error("targetCR must >= 0");
  }

  if(targetCR > 1){
    throw new Error("targetCR must <= 1");
  }

  const bdEu = await getBdEu(hre);
  
  await bdEu.lockCollateralRatioAt(to_d12(targetCR));
}