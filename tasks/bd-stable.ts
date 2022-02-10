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

  task("bds:show:all:crPriceBand").setAction(async (args, hre) => {
    const stables = await getAllBDStables(hre);
    for (const stable of stables) {
      console.log(`${await stable.symbol()} CR price band is ${await stable.price_band_d12()}`);
    }
  });

  task("bds:all:setCrPriceBand")
    .addPositionalParam("newPriceBand", "The desired CR price band")
    .setAction(async ({ newPriceBand }, hre) => {
      const stables = await getAllBDStables(hre);
      for (const stable of stables) {
        const symbol = await stable.symbol();
        console.log(`\n${symbol} CR price band is ${await stable.price_band_d12()}`);
        console.log(`Changing CR price band to ${newPriceBand}`);
        await (await stable.set_price_band_d12(newPriceBand)).wait();
        console.log(`CR price band is now ${await stable.price_band_d12()}`);
      }
    });
}
