import { task } from "hardhat/config";
import { getBdEu, getBdEuWbtcPool, getBdEuWethPool, getBdLens, getDeployer, getTreasury, getUniswapPair, getWbtc, getWeth } from "../test/helpers/common";
import { OracleBasedCryptoFiatFeed } from "../typechain/OracleBasedCryptoFiatFeed";
import { MoneyOnChainPriceFeed } from "../typechain/MoneyOnChainPriceFeed";
import { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { d18_ToNumber, to_d18 } from "../utils/Helpers";
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

  task("show:tmp")
    .setAction(async (args, hre) => {
      const bdEu = await getBdEu(hre);
      const bdStablePool = await getBdEuWethPool(hre);

      const collatPrice = await bdStablePool.getCollateralPrice_d12();
      const bdxPrice = await bdEu.BDX_price_d12();
      const wethFiatPrice = await bdEu.weth_fiat_price();

      const ownerUser = await getDeployer(hre);
      const feed = await hre.ethers.getContract('OracleBasedCryptoFiatFeed_ETH_EUR', ownerUser) as OracleBasedCryptoFiatFeed;
      const feedDecimals = await feed.getDecimals();
      const feedPrice = await feed.getPrice_1e12();

      var feed2 = await hre.ethers.getContract('PriceFeed_ETH_USD', ownerUser) as MoneyOnChainPriceFeed;
      const feed2Decimals = await feed2.decimals();
      const feed2Price = await feed2.price();

      console.log(`collatPrice: ${collatPrice}  bdxPrice: ${bdxPrice}   wethFiatPrice: ${wethFiatPrice}`);
      console.log(`feedPrice: ${feedPrice} feedDecimals: ${feedDecimals}`);
      console.log(`feed2Price: ${feed2Price} feed2Decimals: ${feed2Decimals}`);


      const bdStableWbtcPool = await getBdEuWbtcPool(hre);
      const price = await bdStableWbtcPool.getCollateralPrice_d12();

      console.log("price: " + price)
    });
  
  task("show:tmp-red")
    .setAction(async (args, hre) => {
      const bdStablePool = await getBdEuWethPool(hre);

      await(await bdStablePool.redeemAlgorithmicBdStable(to_d18(0.1),0)).wait(1);
    });

  task("show:tmp-demo")
    .setAction(async (args, hre) => {
      const bdStablePool = await getBdEuWethPool(hre);
      const price1 = await bdStablePool.getCollateralPrice_d12();      
      console.log("price1: " + price1);

      const bdStableWbtcPool = await getBdEuWbtcPool(hre);
      const price2 = await bdStableWbtcPool.getCollateralPrice_d12();
      console.log("price2: " + price2);
    });

  
}