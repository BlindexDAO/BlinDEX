import { task } from "hardhat/config";
import { getBdEu, getBdEuWbtcPool, getBdEuWethPool, getBdLens, getDeployer, getTreasury, getUniswapPair, getWbtc, getWeth } from "../test/helpers/common";
import { OracleBasedCryptoFiatFeed } from "../typechain/OracleBasedCryptoFiatFeed";
import { MoneyOnChainPriceFeed } from "../typechain/MoneyOnChainPriceFeed";
import { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { d18_ToNumber, to_d12, to_d18 } from "../utils/Helpers";
import { getPools, updateOracles } from "../utils/SystemSetup";
import { BDStable } from "../typechain/BDStable";

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

      for (let pool of pools) {
        const pair = await getUniswapPair(hre, pool[0].token, pool[1].token);
        console.log(`starting for ${pool[0].name} / ${pool[1].name}`);
        await (await pair.setConsultLeniency(newVal)).wait();
        console.log("pool done");
      }
      console.log("all done");
    });
  
  task("set:AllowStaleConsults")
    .addPositionalParam("enable", "1 = enable, 0 = disable")
    .setAction(async ({ enable }, hre) => {
      const pools = await getPools(hre);
      for (let pool of pools) {
        const pair = await getUniswapPair(hre, pool[0].token, pool[1].token);
        await(await pair.setAllowStaleConsults(enable == 0 ? false : true)).wait();
        console.log(`oracle ${pool[0].name} / ${pool[1].name} allow stale consults = ${enable}`);
      }
    });

  task("set:lock-cr-at")
    .addPositionalParam("stableAddress", "stable address")
    .addPositionalParam("val", "value")
    .setAction(async ({ stableAddress, val }, hre) => {

      if(val < 0 || val > 1) {
        throw "invalid cr value"
      }

      const deployer = getDeployer(hre);

      const stable = await hre.ethers.getContractAt("BDStable", stableAddress) as BDStable;
      await (await stable.connect((await deployer).address).lockCollateralRatioAt(to_d12(val))).wait();
    });

  task("set:toggle-pause-cr")
    .addPositionalParam("stableAddress", "stable address")
    .setAction(async ({ stableAddress }, hre) => {

      const deployer = getDeployer(hre);

      const stable = await hre.ethers.getContractAt("BDStable", stableAddress) as BDStable;
      await(await stable.connect((await deployer).address).toggleCollateralRatioPaused()).wait();
    });

  // -------------------------- readonly

  task("show:oracles-validFor")
    .setAction(async (args, hre) => {
      const pools = await getPools(hre);
      for (let pool of pools) {
        const pair = await getUniswapPair(hre, pool[0].token, pool[1].token);
        const validFor = await pair.when_should_update_oracle_in_seconds();
        console.log(`oracle ${pool[0].name} / ${pool[1].name} valid for: ${validFor}s`);
      }
    });

  task("show:pools")
    .setAction(async (args, hre) => {
      const pools = await getPools(hre);

      for (let pool of pools) {
        const pair = await getUniswapPair(hre, pool[0].token, pool[1].token);
        console.log(`${pool[0].name} / ${pool[1].name} : ${pair.address}`);
        console.log(`\t${pool[0].token.address} / ${pool[1].token.address}`);
      }
    });

  task("show:pool-reserves")
    .addPositionalParam("pairAddress", "pair address")
    .setAction(async ({ pairAddress }, hre) => {
      const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;
      const reserves = await pair.getReserves();
      console.log(`Reserves: ${d18_ToNumber(reserves[0])} ${d18_ToNumber(reserves[1])}`)
    });

  task("show:users")
    .setAction(async (args, hre) => {
      const deployer = await getDeployer(hre);
      const treasury = await getTreasury(hre);

      console.log("deployer: " + deployer.address);
      console.log("treasury: " + treasury.address);
    });

  task("show:bdstables")
    .setAction(async (args, hre) => {
      const bdLens = await getBdLens(hre);

      const stables = await bdLens.AllBdStables()

      for (let stable of stables) {
        console.log(`${stable.fiat} ${stable.token}`);
      }
    });
}