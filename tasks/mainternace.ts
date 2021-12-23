import { task } from "hardhat/config";
import { getBdEu, getBdEuWethPool, getBdx, getBot, getDeployer, getTreasury, getUniswapFactory, getUniswapPair, getUniswapPairOracle, getUniswapRouter, getWeth } from "../utils/DeployedContractsHelpers";
import { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { bigNumberToDecimal, d12_ToNumber, d18_ToNumber, numberToBigNumberFixed, to_d12, to_d18 } from "../utils/NumbersHelpers";
import { getPools, tokensDecimals, updateUniswapPairsOracles } from "../utils/UniswapPoolsHelpers";
import { BDStable } from "../typechain/BDStable";
import { FiatToFiatPseudoOracleFeed } from "../typechain/FiatToFiatPseudoOracleFeed";
import { IOracleBasedCryptoFiatFeed } from "../typechain/IOracleBasedCryptoFiatFeed";
import { SovrynSwapPriceFeed } from "../typechain/SovrynSwapPriceFeed";
import { BtcToEthOracleChinlink } from "../typechain/BtcToEthOracleChinlink";
import { IPriceFeed } from "../typechain/IPriceFeed";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { UpdaterRSK } from "../typechain/UpdaterRSK";
import { BigNumber } from "@ethersproject/bignumber";

export function load() {

  task("update:all")
    .addParam("btcusd", "BTCUSD price")
    .addParam("ethbtc", "ETHBTC price")
    .addParam("eurusd", "EURUSD price")
    .setAction(async ({ btcusd, ethbtc, eurusd }, hre) => {
      const bot = await getBot(hre);

      if (hre.network.name == "rsk") {
        console.log("starting sovryn swap price oracles updates");
        const oracleEthUsd = await hre.ethers.getContract('PriceFeed_ETH_USD', bot) as SovrynSwapPriceFeed;
        await (await oracleEthUsd.updateOracleWithVerification(to_d12(btcusd))).wait();
        console.log("updated ETH / USD (RSK BTC / USD)");

        const oracleBtcEth = await hre.ethers.getContract('BtcToEthOracle', bot) as SovrynSwapPriceFeed;
        await (await oracleBtcEth.updateOracleWithVerification(to_d12(ethbtc))).wait();
        console.log("updated BTC / ETH (RSK ETH / BTC)");

        console.log("starting fiat to fiat oracles updates");
        const oracleEurUsd = await hre.ethers.getContract('PriceFeed_EUR_USD', bot) as FiatToFiatPseudoOracleFeed;
        await (await oracleEurUsd.setPrice(to_d12(eurusd))).wait();
        console.log("updated EUR / USD");
      }

      console.log("starting uniswap pairs oracles updates");
      await updateUniswapPairsOracles(hre, bot);

      console.log("starting refresh collateral ratio");
      const bdEu = await getBdEu(hre);
      await (await bdEu.connect(bot).refreshCollateralRatio()).wait();
      console.log("refreshed collateral ratio");
    });

  task("update:eurusd:rsk")
    .addPositionalParam("eurusd", "EURUSD price")
    .setAction(async ({ eurusd }, hre) => {
      if (hre.network.name != 'rsk') {
        throw new Error("RSK only task");
      }
      const deployer = await getDeployer(hre);
      const oracleEurUsd = await hre.ethers.getContract('PriceFeed_EUR_USD', deployer) as FiatToFiatPseudoOracleFeed;
      await (await oracleEurUsd.connect(deployer).setPrice(to_d12(eurusd))).wait();
      console.log("updated EUR / USD");
    })

  task("update:all-with-bot:local")
    .setAction(async (args, hre) => {
      console.log("starting the updater");

      const bot = await getBot(hre);
      const updater = await hre.ethers.getContract('Updater', bot) as UpdaterRSK;

      let uniOracles = [];
      const pools = await getPools(hre);
      for (let pool of pools) {
        const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        uniOracles.push(oracle.address);
      }
      const bdeu = await getBdEu(hre) as BDStable;

      await (await updater.update(
        [], [],
        [], [],
        uniOracles,
        [bdeu.address]))
        .wait();

      console.log("updater has updated");
    });

  task("update:all-with-bot:rsk")
    //on RSK btc and eth are replacing each other | btcusd param -> PriceFeed_ETH_USD | ethbtc param -> BtcToEthOracle
    .addParam("btcusd", "btcusd price to_d12")
    .addParam("ethbtc", "ethbtc price to_d12")
    .addParam("eurusd", "eurusd price to_d12")
    .setAction(async ({ btcusd, ethbtc, eurusd }, hre) => {
      console.log("starting the updater");

      const bot = await getBot(hre);
      const updater = await hre.ethers.getContract('Updater', bot) as UpdaterRSK;

      const oracleEthUsd = await hre.ethers.getContract('PriceFeed_ETH_USD', bot) as SovrynSwapPriceFeed;
      const oracleBtcEth = await hre.ethers.getContract('BtcToEthOracle', bot) as SovrynSwapPriceFeed;
      const oracleEurUsd = await hre.ethers.getContract('PriceFeed_EUR_USD', bot) as FiatToFiatPseudoOracleFeed;

      let uniOracles = [];
      const pools = await getPools(hre);
      for (let pool of pools) {
        const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        uniOracles.push(oracle.address);
      }
      const bdeu = await getBdEu(hre);

      await (await updater.update(
        [oracleEthUsd.address, oracleBtcEth.address], [to_d12(btcusd), to_d12(ethbtc)], //on RSK btc and eth are replacing each other
        [oracleEurUsd.address], [to_d12(eurusd)],
        uniOracles,
        [bdeu.address]
      )).wait();

      console.log("updater has updated");
    });

  task("set:updater")
    .addPositionalParam("newUpdater", "new updater address")
    .setAction(async ({ newUpdater }, hre) => {
      console.log("starting the setUpdaters");

      const networkName = hre.network.name;
      const deployer = await getDeployer(hre);
      const oracleEthUsd = await hre.ethers.getContract('PriceFeed_ETH_USD', deployer) as SovrynSwapPriceFeed;
      const oracleBtcEth = await hre.ethers.getContract('BtcToEthOracle', deployer) as SovrynSwapPriceFeed;
      const oracleEurUsd = await hre.ethers.getContract('PriceFeed_EUR_USD', deployer) as FiatToFiatPseudoOracleFeed;

      if (networkName == 'rsk') {
        await (await oracleEthUsd.setUpdater(newUpdater)).wait();
        console.log("updated oracleEthUsd");

        await (await oracleBtcEth.setUpdater(newUpdater)).wait();
        console.log("updated oracleBtcEth");

        await (await oracleEurUsd.setUpdater(newUpdater)).wait();
        console.log("updated oracleEurUsd");
      }

      console.log("updaters set");
    });

  task("set:oracles:ConsultLeniency")
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

  task("set:oracles:AllowStaleConsults")
    .addPositionalParam("enable", "1 = enable, 0 = disable")
    .setAction(async ({ enable }, hre) => {
      const pools = await getPools(hre);
      for (let pool of pools) {
        const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);

        await (await oracle.setAllowStaleConsults(enable == 0 ? false : true)).wait();
        console.log(`oracle ${pool[0].name} / ${pool[1].name} allow stale consults = ${enable}`);
      }
    });

  task("set:lockCollateralRatioAt")
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

  task("set:stable-toggleCollateralRatioPaused")
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

  task("show:oracles-prices")
    .setAction(async (args, hre) => {
      await show_uniswapOraclesPrices(hre, true);
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

  task("show:full-diagnostics")
    .addOptionalPositionalParam("showPrices", "if true, shows all prices", "false")
    .setAction(async ({ showPrices }, hre) => {
      await show_ethEur(hre);
      await show_ethUsd(hre);
      await show_btcEth(hre);
      await show_eurUsd(hre);

      await show_uniswapOraclesPrices(hre, showPrices == "true" ? true : false);

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
    const feed = await hre.ethers.getContract("PriceFeed_ETH_USD") as IPriceFeed;
    const price = bigNumberToDecimal(await feed.price(), await feed.decimals());
    console.log("ETH/USD (RSK: BTC/USD): " + price);
  }

  async function show_btcEth(hre: HardhatRuntimeEnvironment) {
    let price;
    if (hre.network.name == "rsk") {
      const feed = await hre.ethers.getContract("BtcToEthOracle") as IPriceFeed;
      price = bigNumberToDecimal(await feed.price(), await feed.decimals());
    } else {
      const feed = await hre.ethers.getContract("BtcToEthOracle") as BtcToEthOracleChinlink;
      price = d12_ToNumber(await feed.getPrice_1e12());
    }
    console.log("BTC/ETH (RSK: ETH/BTC): " + price);
  }

  async function show_eurUsd(hre: HardhatRuntimeEnvironment) {
    const feed = await hre.ethers.getContract("PriceFeed_EUR_USD") as IPriceFeed;
    const price = bigNumberToDecimal(await feed.price(), await feed.decimals());
    let lastUpdateTimestamp = 0;
    if (hre.network.name == "rsk") {
      const feedConcrete = feed as FiatToFiatPseudoOracleFeed;
      lastUpdateTimestamp = await (await feedConcrete.lastUpdateTimestamp()).toNumber();
    }

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

  async function show_uniswapOraclesPrices(hre: HardhatRuntimeEnvironment, showPrices: boolean) {
    const pools = await getPools(hre);

    const factory = await getUniswapFactory(hre);

    for (let pool of pools) {
      const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
      const updatedAgo = (new Date().getTime() / 1000) - (await oracle.blockTimestampLast());

      const pair = await getUniswapPair(hre, pool[0].token, pool[1].token)
      const reserves = await pair.getReserves();

      if (showPrices) {
        const token0Address = pool[0].token.address;
        const token0Name = pool[0].name;
        const token1Name = pool[1].name;

        const token0Decimals = tokensDecimals(hre, token0Name);
        const token1Decimals = tokensDecimals(hre, token1Name);

        const amountIn = to_d18(1e6);
        let amountOut: BigNumber;

        if (token0Decimals < token1Decimals) {
          const missingDecimals = BigNumber.from(token1Decimals - token0Decimals);
          amountOut = await oracle.consult(token0Address, amountIn.div(BigNumber.from(10).pow(missingDecimals)));
        } else if (token0Decimals > token1Decimals) {
          const missingDecimals = BigNumber.from(token0Decimals - token1Decimals);
          amountOut = await oracle.consult(token0Address, amountIn.mul(BigNumber.from(10).pow(missingDecimals)));
        } else {
          amountOut = await oracle.consult(token0Address, amountIn);
        }

        const price = d12_ToNumber(to_d12(1).mul(amountOut).div(amountIn));

        console.log(`oracle ${pool[0].name} / ${pool[1].name} price: ${price}, updated: ${Math.round(updatedAgo)}s ago`);
        console.log(`       ${pool[1].name} / ${pool[0].name} price: ${1 / price}`);
      } else {
        console.log(`oracle ${pool[0].name} / ${pool[1].name} updated: ${Math.round(updatedAgo)}s ago`);
      }

      console.log(`       liquidity: ${reserves[0].toString()}  |  ${reserves[1].toString()}`)
    }
  }
}