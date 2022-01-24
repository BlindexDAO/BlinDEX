import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { to_d12 } from "../../utils/NumbersHelpers";
import { getBdEu, getBdUs } from "../../utils/DeployedContractsHelpers";
import type { BDStable } from "../../typechain/BDStable";

export async function lockBdEuCrAt(hre: HardhatRuntimeEnvironment, targetCR: number) {
  const bdEu = await getBdEu(hre);
  await lockBdStableCR(targetCR, bdEu);
}

export async function lockBdUsCrAt(hre: HardhatRuntimeEnvironment, targetCR: number) {
  const bdUs = await getBdUs(hre);
  await lockBdStableCR(targetCR, bdUs);
}

async function lockBdStableCR(targetCR: number, bdStable: BDStable) {
  if (targetCR < 0) {
    throw new Error("targetCR must >= 0");
  }

  if (targetCR > 1) {
    throw new Error("targetCR must <= 1");
  }

  await bdStable.lockCollateralRatioAt(to_d12(targetCR));
}
