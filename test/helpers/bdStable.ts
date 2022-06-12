import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { to_d12 } from "../../utils/NumbersHelpers";
import { getBdEu, getBdUs, getBgbp, getBxau } from "../../utils/DeployedContractsHelpers";
import type { BDStable } from "../../typechain/BDStable";
import { Recorder } from "../../utils/Recorder/Recorder";
import { toRc } from "../../utils/Recorder/RecordableContract";

export async function lockBdeuCrAt(hre: HardhatRuntimeEnvironment, targetCR: number, recorder: Recorder | null = null) {
  console.log("Lock BDEU CR at", targetCR);
  const bdEu = await getBdEu(hre);
  await lockBdStableCrAt(targetCR, bdEu, recorder);
  console.log("Lock BDEU completed!");
}

export async function lockBdusCrAt(hre: HardhatRuntimeEnvironment, targetCR: number, recorder: Recorder | null = null) {
  console.log("Lock BDUS CR at", targetCR);
  const bdUs = await getBdUs(hre);
  await lockBdStableCrAt(targetCR, bdUs, recorder);
  console.log("Lock BDUS completed!");
}

export async function lockBxauCrAt(hre: HardhatRuntimeEnvironment, targetCR: number, recorder: Recorder | null = null) {
  console.log("Lock bXAU CR at", targetCR);
  const bxau = await getBxau(hre);
  await lockBdStableCrAt(targetCR, bxau, recorder);
  console.log("Lock bXAU completed!");
}

export async function lockBgbpCrAt(hre: HardhatRuntimeEnvironment, targetCR: number, recorder: Recorder | null = null) {
  console.log("Lock bGBP CR at", targetCR);
  const bgbp = await getBgbp(hre);
  await lockBdStableCrAt(targetCR, bgbp, recorder);
  console.log("Lock bGBP completed!");
}

export async function lockBdStableCrAt(targetCR: number, bdStable: BDStable, recorder: Recorder | null) {
  if (targetCR < 0) {
    throw new Error("targetCR must >= 0");
  }

  if (targetCR > 1) {
    throw new Error("targetCR must <= 1");
  }

  if (recorder) {
    await toRc(bdStable, recorder).record.lockCollateralRatioAt(to_d12(targetCR));
  } else {
    await (await bdStable.lockCollateralRatioAt(to_d12(targetCR))).wait();
  }
}

export async function toggleBdeuCrPaused(hre: HardhatRuntimeEnvironment) {
  console.log("Toggle BDEU CR Pasued");
  const bdEu = await getBdEu(hre);
  await toggleBdStableCrPaused(bdEu);
  console.log("Toggle BDEU paused completed!");
}

export async function toggleBdusCrPaused(hre: HardhatRuntimeEnvironment) {
  console.log("Toggle BDUS CR Pasued");
  const bdUs = await getBdUs(hre);
  await toggleBdStableCrPaused(bdUs);
  console.log("Toggle BDUS paused completed!");
}

async function toggleBdStableCrPaused(bdStable: BDStable) {
  await (await bdStable.toggleCollateralRatioPaused()).wait();
}
