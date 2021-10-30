import { task } from "hardhat/config";
import { getUniswapPair, getWbtc, getWeth } from "../test/helpers/common";
import { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { d18_ToNumber } from "../utils/Helpers";
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
        const pair = await getUniswapPair(hre, pool[0].token, pool[1].token);
        console.log(`starting for ${pool[0].name} / ${pool[1].name}`);
        await(await pair.setConsultLeniency(newVal)).wait();
        console.log("pool done");
      }
      console.log("all done");
    });

  // -------------------------- readonly

  task("show:oracles-validFor")
    .setAction(async (args, hre) => {
      const pools = await getPools(hre);
      for(let pool of pools){
        const pair = await getUniswapPair(hre, pool[0].token, pool[1].token);
        const validFor = await pair.when_should_update_oracle_in_seconds();
        console.log(`oracle ${pool[0].name} / ${pool[1].name} valid for: ${validFor}s`);
      }
    });

  task("showPools")
    .setAction(async (args, hre) => {
      const pools = await getPools(hre);
      
      for(let pool of pools){
        const pair = await getUniswapPair(hre, pool[0].token, pool[1].token);
        console.log(`${pool[0].name} / ${pool[1].name} : ${pair.address}`);
        console.log(`\t${pool[0].token.address} / ${pool[1].token.address}`);
      }
    });

  task("showPoolReserves")
    .addPositionalParam("pairAddress", "pair address")
    .setAction(async ({ pairAddress }, hre) => {
      const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;
      const reserves = await pair.getReserves();
      console.log(`Reserves: ${d18_ToNumber(reserves[0])} ${d18_ToNumber(reserves[1])}`)
    });
}