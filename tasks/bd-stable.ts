import { task } from "hardhat/config";
import {
  lockBdeuCrAt,
  lockBdStableCrAt,
  lockBdusCrAt,
  lockBgbpCrAt,
  lockBxauCrAt,
  toggleBdeuCrPaused,
  toggleBdusCrPaused
} from "../test/helpers/bdStable";
import { getAllBdStables, getAllBDStables } from "../utils/DeployedContractsHelpers";
import { toRc } from "../utils/Recorder/RecordableContract";
import { defaultRecorder } from "../utils/Recorder/Recorder";

export function load() {
  task("bds:bdeu:lockCollateralRatio")
    .addPositionalParam("crRatio", "The desired collateral ratio")
    .setAction(async ({ crRatio }, hre) => {
      const recorder = await defaultRecorder(hre);
      await lockBdeuCrAt(hre, crRatio, recorder);
      await recorder.execute();
    });

  task("bds:bdus:lockCollateralRatio")
    .addPositionalParam("crRatio", "The desired collateral ratio")
    .setAction(async ({ crRatio }, hre) => {
      const recorder = await defaultRecorder(hre);
      await lockBdusCrAt(hre, crRatio, recorder);
      await recorder.execute();
    });

  task("bds:bxau:lockCollateralRatio")
    .addPositionalParam("crRatio", "The desired collateral ratio")
    .setAction(async ({ crRatio }, hre) => {
      const recorder = await defaultRecorder(hre);
      await lockBxauCrAt(hre, crRatio, recorder);
      await recorder.execute();
    });

  task("bds:bgbp:lockCollateralRatio")
    .addPositionalParam("crRatio", "The desired collateral ratio")
    .setAction(async ({ crRatio }, hre) => {
      const recorder = await defaultRecorder(hre);
      await lockBgbpCrAt(hre, crRatio, recorder);
      await recorder.execute();
    });

  task("bds:all:lockCollateralRatio")
    .addPositionalParam("crRatio", "The desired collateral ratio")
    .setAction(async ({ crRatio }, hre) => {
      const recorder = await defaultRecorder(hre);

      const stables = await getAllBdStables(hre);
      for (const stable of stables) {
        await lockBdStableCrAt(crRatio, stable, recorder);
      }

      await recorder.execute();
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

  task("bds:show:all:crPriceBand").setAction(async (args, hre) => {
    const stables = await getAllBDStables(hre);
    for (const stable of stables) {
      console.log(`${await stable.symbol()} CR price band is ${await stable.price_band_d12()}`);
    }
  });

  task("bds:all:setCrPriceBand")
    .addPositionalParam("newPriceBand", "The desired CR price band")
    .setAction(async ({ newPriceBand }, hre) => {
      const recorder = await defaultRecorder(hre);

      const stables = await getAllBDStables(hre);
      for (const stable of stables) {
        const symbol = await stable.symbol();
        console.log(`\n${symbol} CR price band is ${await stable.price_band_d12()}`);
        console.log(`Changing CR price band to ${newPriceBand}`);
        await toRc(stable, recorder).record.set_price_band_d12(newPriceBand);
      }

      await recorder.execute();
    });
}
