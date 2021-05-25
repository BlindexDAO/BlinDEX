import { HardhatRuntimeEnvironment } from "hardhat/types";
import { simulateTimeElapseInSeconds, toErc20, erc20ToNumber } from "../../utils/Helpers"
import { getBdEur } from "./common"
import { updateWethPair } from "./swaps";

const oneHour = 60*60;

export async function refreshRatios(hre: HardhatRuntimeEnvironment){
  await simulateTimeElapseInSeconds(oneHour*2);

  await updateWethPair(hre, "BDEUR");

  const bdEur = await getBdEur(hre);
  await bdEur.refreshCollateralRatio();
}