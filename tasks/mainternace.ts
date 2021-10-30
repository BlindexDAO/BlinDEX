import { task } from "hardhat/config";
import { getUniswapPair, getWbtc, getWeth } from "../test/helpers/common";
import { getPools, updateOracles } from "../utils/SystemSetup";

export function load() {
  task("update:oracles")
    .setAction(async (args, hre) => {
      await updateOracles(hre);
    });

  task("setPoolConsultLeniency")
    .addPositionalParam("newVal", "new value")
    .setAction(async ({ newVal }, hre) => {
      const pools = await getPools(hre);
      
      console.log("setting consultLeniency to: " + newVal);

      for(let pool of pools){
        const pair = await getUniswapPair(hre, pool[0].address, pool[1].address);
        console.log(`starting for ${pool[0].name} / ${pool[1].name}`);
        await(await pair.setConsultLeniency(newVal)).wait();
        console.log("pool done");
      }
      console.log("all done");
    });
}