import { task } from "hardhat/config";
import { getBdEu, getBdEuWethPool, getBdx, getBot, getDeployer, getTreasury, getUniswapPair, getUniswapPairOracle, getWeth } from "../utils/DeployedContractsHelpers";
import { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { d12_ToNumber, d18_ToNumber, to_d12, to_d18 } from "../utils/NumbersHelpers";
import { getPools, updateUniswapPairsOracles } from "../utils/UniswapPoolsHelpers";
import { BDStable } from "../typechain/BDStable";
import { FiatToFiatPseudoOracleFeed } from "../typechain/FiatToFiatPseudoOracleFeed";
import { IOracleBasedCryptoFiatFeed } from "../typechain/IOracleBasedCryptoFiatFeed";
import { SovrynSwapPriceFeed } from "../typechain/SovrynSwapPriceFeed";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Updater } from "../typechain/Updater";

export function load() {

  task("update:oracles")
    .setAction(async (args, hre) => {
      console.log("starting uniswap pairs oracles updates");
      await updateUniswapPairsOracles(hre);

      console.log("starting sovryn swap price oracles updates");
      const bot = await getBot(hre);
      const oracleEthUsd = await hre.ethers.getContract('PriceFeed_ETH_USD', bot) as SovrynSwapPriceFeed;
      await (await oracleEthUsd.updateOracleWithVerification(to_d12(4694.94))).wait(); //todo ag from parameters
      console.log("updated ETH / USD");

      const oracleBtcEth = await hre.ethers.getContract('BtcToEthOracle', bot) as SovrynSwapPriceFeed;
      await (await oracleBtcEth.updateOracleWithVerification(to_d12(0.08227))).wait();//todo ag from parameters
      console.log("updated BTC / ETH");

      console.log("starting fiat to fiat oracels updates");
      const oracleEurUsd = await hre.ethers.getContract('PriceFeed_EUR_USD', bot) as FiatToFiatPseudoOracleFeed;
      await (await oracleEurUsd.setPrice(to_d12(1.1321))).wait(); //todo ag from parameters
      console.log("updated EUR / USD");
    });

  task("update:all")
    .addParam("ethusd", "price feed ethusd price to_d12")
    .addParam("btceth", "price feed btceth price to_d12")
    .addParam("eurusd", "price feed eurusd price to_d12")
    .setAction(async ({ ethusd, btceth, eurusd }, hre) => {
      console.log("starting the updater");

      const networkName = hre.network.name;
      const bot = await getBot(hre);
      const updater = await hre.ethers.getContract('Updater', bot) as Updater;

      const bdeu = await getBdEu(hre) as BDStable;
      let uniOracles = [];
      const pools = await getPools(hre);
      for (let pool of pools) {
        const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        uniOracles.push(oracle.address);
      }

      if (networkName == 'rsk') {
        const oracleEthUsd = await hre.ethers.getContract('PriceFeed_ETH_USD', bot) as SovrynSwapPriceFeed;
        const oracleBtcEth = await hre.ethers.getContract('BtcToEthOracle', bot) as SovrynSwapPriceFeed;
        const oracleEurUsd = await hre.ethers.getContract('PriceFeed_EUR_USD', bot) as FiatToFiatPseudoOracleFeed;

        await (await updater.update(
          [oracleEthUsd.address, oracleBtcEth.address], [to_d12(ethusd), to_d12(btceth)],
          [oracleEurUsd.address], [to_d12(eurusd)],
          uniOracles,
          [bdeu.address]))
          .wait();
      }
      else {
        await (await updater.update(
          [], [],
          [], [],
          uniOracles,
          [bdeu.address]))
          .wait();
      }

      console.log("updater has updated");
    });

  task("setUpdaters")
    .addPositionalParam("newUpdater", "new updater address")
    .setAction(async ({ newUpdater }, hre) => {
      console.log("starting the setUpdaters");

      const networkName = hre.network.name;
      const bot = await getBot(hre);
      const oracleEthUsd = await hre.ethers.getContract('PriceFeed_ETH_USD', bot) as SovrynSwapPriceFeed;
      const oracleBtcEth = await hre.ethers.getContract('BtcToEthOracle', bot) as SovrynSwapPriceFeed;
      const oracleEurUsd = await hre.ethers.getContract('PriceFeed_EUR_USD', bot) as FiatToFiatPseudoOracleFeed;

      if (networkName == 'rsk') {
        await (await oracleEthUsd.setUpdater(newUpdater)).wait();
        await (await oracleBtcEth.setUpdater(newUpdater)).wait();
        await (await oracleEurUsd.setUpdater(newUpdater)).wait();
      }
      else {
      }

      console.log("updaters set");
    });

  task("setPoolConsultLeniency")
    .addPositionalParam("newVal", "new value")
    .setAction(async ({ newVal }, hre) => {
      const pools = await getPools(hre);

      console.log("setting consultLeniency to: " + newVal);

      for (let pool of pools) {
        const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        console.log(`starting for ${pool[0].name} / ${pool[1].name}`);

        await (await oracle.setConsultLeniency(newVal)).wait();
        console.log("pool done");
      }
      console.log("all done");
    });

  task("set:AllowStaleConsults")
    .addPositionalParam("enable", "1 = enable, 0 = disable")
    .setAction(async ({ enable }, hre) => {
      const pools = await getPools(hre);
      for (let pool of pools) {
        const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);

        await (await oracle.setAllowStaleConsults(enable == 0 ? false : true)).wait();
        console.log(`oracle ${pool[0].name} / ${pool[1].name} allow stale consults = ${enable}`);
      }
    });

  task("set:lock-cr-at")
    .addPositionalParam("stableAddress", "stable address")
    .addPositionalParam("val", "value")
    .setAction(async ({ stableAddress, val }, hre) => {

      if (val < 0 || val > 1) {
        throw "invalid cr value"
      }

      const deployer = await getDeployer(hre);

      const stable = await hre.ethers.getContractAt("BDStable", stableAddress) as BDStable;
      await (await stable.connect(deployer).lockCollateralRatioAt(to_d12(val))).wait();
    });

  task("set:toggle-pause-cr")
    .addPositionalParam("stableAddress", "stable address")
    .setAction(async ({ stableAddress }, hre) => {

      const deployer = await getDeployer(hre);

      const stable = await hre.ethers.getContractAt("BDStable", stableAddress) as BDStable;
      await (await stable.connect(deployer).toggleCollateralRatioPaused()).wait();
    });

  task("set:rsk-eur-usd")
    .addPositionalParam("newPrice", "new price")
    .setAction(async ({ newPrice }, hre) => {
      const bot = await hre.ethers.getNamedSigner('BOT');

      if (newPrice < 0.5 || newPrice > 2) {
        throw "invalid price";
      }

      console.log("Setting EUR/USD: " + newPrice);

      const feed = await hre.ethers.getContract("PriceFeed_EUR_USD") as FiatToFiatPseudoOracleFeed;
      await (await feed.connect(bot).setPrice(to_d12(newPrice))).wait();
    });

  task("run:mint-some-bdeu")
    .addPositionalParam("allowBdx", "can we pay bdx on top o collateral to mint")
    .setAction(async (args, hre) => {
      const pool = await getBdEuWethPool(hre);
      const weth = await getWeth(hre);
      const bdx = await getBdx(hre);

      const btcIn = to_d18(0.00001);
      await (await weth.approve(pool.address, to_d18(0.001))).wait();
      await (await bdx.approve(pool.address, to_d18(100))).wait();
      await (await pool.mintFractionalBdStable(btcIn, to_d18(1), to_d18(0.001), false)).wait();
    });
  // -------------------------- readonly

  task("show:oracles-validFor")
    .setAction(async (args, hre) => {
      const pools = await getPools(hre);
      for (let pool of pools) {
        const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        const validFor = await oracle.when_should_update_oracle_in_seconds();
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
      const bot = await getBot(hre);

      console.log("deployer: " + deployer.address);
      console.log("treasury: " + treasury.address);
      console.log("bot     : " + bot.address);
    });

  task("show:bdeu-ef-bdx-cov")
    .setAction(async (args, hre) => {
      await show_efBDXCov(hre);
    });

  task("show:rsk-eur-usd")
    .setAction(async (args, hre) => {
      await show_eurUsd(hre);
    });

  task("show:rsk-eth-usd")
    .setAction(async (args, hre) => {
      await show_ethUsd(hre);
    });

  task("show:eth-usd")
    .setAction(async (args, hre) => {
      await show_ethEur(hre);
    });

  task("show:full-diagnostics")
    .setAction(async (args, hre) => {
      await show_ethEur(hre);
      await show_ethUsd(hre);
      await show_btcEth(hre);
      await show_eurUsd(hre);

      await show_uniswapOraclesPrices(hre);

      await show_efCR(hre);
      await show_CR(hre);
      await show_efBDXCov(hre);
    });

  async function show_ethEur(hre: HardhatRuntimeEnvironment) {
    const feed = await hre.ethers.getContract("OracleBasedCryptoFiatFeed_ETH_EUR") as IOracleBasedCryptoFiatFeed;
    const price = d12_ToNumber(await feed.getPrice_1e12());
    console.log("ETH/EUR (RSK: BTC/EUR): " + price);
  }

  async function show_ethUsd(hre: HardhatRuntimeEnvironment) {
    const feed = await hre.ethers.getContract("PriceFeed_ETH_USD") as SovrynSwapPriceFeed;
    const price = d12_ToNumber(await feed.price());
    console.log("ETH/USD (RSK: BTC/USD): " + price);
  }

  async function show_btcEth(hre: HardhatRuntimeEnvironment) {
    const feed = await hre.ethers.getContract("BtcToEthOracle") as SovrynSwapPriceFeed;
    const price = d12_ToNumber(await feed.price());
    console.log("BTC/ETH (RSK: ETH/BTC): " + price);
  }

  async function show_eurUsd(hre: HardhatRuntimeEnvironment) {
    const feed = await hre.ethers.getContract("PriceFeed_EUR_USD") as FiatToFiatPseudoOracleFeed;
    const price = d12_ToNumber(await feed.price());
    const lastUpdateTimestamp = await (await feed.lastUpdateTimestamp()).toNumber();
    console.log("EUR/USD: " + price + " last updated: " + new Date(lastUpdateTimestamp * 1000));
  }

  async function show_efBDXCov(hre: HardhatRuntimeEnvironment) {
    const bdeu = await getBdEu(hre);
    const efBdxCov = await bdeu.get_effective_bdx_coverage_ratio();
    console.log("BEDU efBDXCov: " + d12_ToNumber(efBdxCov));
  }

  async function show_efCR(hre: HardhatRuntimeEnvironment) {
    const bdeu = await getBdEu(hre);
    const efCR = await bdeu.effective_global_collateral_ratio_d12();
    console.log("BEDU efCR: " + d12_ToNumber(efCR));
  }

  async function show_CR(hre: HardhatRuntimeEnvironment) {
    const bdeu = await getBdEu(hre);
    const efCR = await bdeu.global_collateral_ratio_d12();
    console.log("BEDU CR: " + d12_ToNumber(efCR));
  }

  async function show_uniswapOraclesPrices(hre: HardhatRuntimeEnvironment) {
    const pools = await getPools(hre);
    for (let pool of pools) {
      const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
      const validFor = await oracle.when_should_update_oracle_in_seconds();
      console.log(`oracle ${pool[0].name} / ${pool[1].name} valid for: ${validFor}s`);
    }
  }
}