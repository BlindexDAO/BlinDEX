import { task } from "hardhat/config";
import { lockBdeuCrAt, lockBdusCrAt, toggleBdeuCrPaused, toggleBdusCrPaused } from "../test/helpers/bdStable";
import { getAllBDStables } from "../utils/DeployedContractsHelpers";

export function load() {
  task("bds:bdeu:lockCollateralRatio")
    .addPositionalParam("crRatio", "The desired collateral ratio")
    .setAction(async ({ crRatio }, hre) => {
      await lockBdeuCrAt(hre, crRatio);
    });

  task("bds:bdus:lockCollateralRatio")
    .addPositionalParam("crRatio", "The desired collateral ratio")
    .setAction(async ({ crRatio }, hre) => {
      await lockBdusCrAt(hre, crRatio);
    });

  task("bds:all:lockCollateralRatio")
    .addPositionalParam("crRatio", "The desired collateral ratio")
    .setAction(async ({ crRatio }, hre) => {
      await lockBdeuCrAt(hre, crRatio);
      await lockBdusCrAt(hre, crRatio);
    });

  task("bds:bdeu:toggleCrPaused").setAction(async (args, hre) => {
    await toggleBdeuCrPaused(hre);
  });

  task("bds:bdus:toggleCrPaused").setAction(async (args, hre) => {
    await toggleBdusCrPaused(hre);
  });

  task("bds:show:all:CrPaused").setAction(async (args, hre) => {
    const stables = await getAllBDStables(hre);
    for (const stable of stables) {
      console.log(`${await stable.symbol()} CR paused status is: ${await stable.collateral_ratio_paused()}`);
    }
  });

  task("bds:all:toggleCrPaused").setAction(async (args, hre) => {
    await toggleBdeuCrPaused(hre);
    await toggleBdusCrPaused(hre);
  });

  task("bds:show:all:cr").setAction(async (args, hre) => {
    const stables = await getAllBDStables(hre);
    for (const stable of stables) {
      console.log(`${await stable.symbol()} CR is: ${await stable.global_collateral_ratio_d12()}`);
    }
  });
}
