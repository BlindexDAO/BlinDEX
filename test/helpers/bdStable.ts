import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { to_d12 } from "../../utils/NumbersHelpers";
import { getBdEu, getBdUs } from "../../utils/DeployedContractsHelpers";
import type { BDStable } from "../../typechain/BDStable";

export async function lockBdeuCrAt(hre: HardhatRuntimeEnvironment, targetCR: number) {
  console.log("Lock BDEU CR at", targetCR);
  const bdEu = await getBdEu(hre);
  await lockBdStableCRAt(targetCR, bdEu);
  console.log("Lock BDEU completed!");
}

export async function lockBdusCrAt(hre: HardhatRuntimeEnvironment, targetCR: number) {
  console.log("Lock BDUS CR at", targetCR);
  const bdUs = await getBdUs(hre);
  await lockBdStableCRAt(targetCR, bdUs);
  console.log("Lock BDUS completed!");
}

async function lockBdStableCRAt(targetCR: number, bdStable: BDStable) {
  if (targetCR < 0) {
    throw new Error("targetCR must >= 0");
  }

  if (targetCR > 1) {
    throw new Error("targetCR must <= 1");
  }

  await (await bdStable.lockCollateralRatioAt(to_d12(targetCR))).wait();
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
