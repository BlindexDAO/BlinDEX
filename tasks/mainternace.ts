import { task } from "hardhat/config";
import {
  getAllBDStableStakingRewards,
  getAllBDStablePools,
  getAllBDStables,
  getBdEu,
  getBdEuWethPool,
  getBdUs,
  getBdx,
  getBot,
  getDeployer,
  getStakingRewardsDistribution,
  getTreasury,
  getUniswapPair,
  getUniswapPairOracle,
  getUpdater,
  getVesting,
  getWeth,
  formatAddress,
  getSovrynFeed_RbtcUsd as getSovrynFeed_RbtcUsd,
  getSovrynFeed_RbtcEths as getSovrynFeed_RbtcEths,
  getFiatToFiat_EurUsd
} from "../utils/DeployedContractsHelpers";
import type { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { bigNumberToDecimal, d12_ToNumber, d18_ToNumber, to_d12, to_d18 } from "../utils/NumbersHelpers";
import { getPools, tokensDecimals, updateUniswapPairsOracles, resetUniswapPairsOracles } from "../utils/UniswapPoolsHelpers";
import type { BDStable } from "../typechain/BDStable";
import type { FiatToFiatPseudoOracleFeed } from "../typechain/FiatToFiatPseudoOracleFeed";
import type { IOracleBasedCryptoFiatFeed } from "../typechain/IOracleBasedCryptoFiatFeed";
import type { SovrynSwapPriceFeed } from "../typechain/SovrynSwapPriceFeed";
import type { BtcToEthOracleChinlink } from "../typechain/BtcToEthOracleChinlink";
import type { IPriceFeed } from "../typechain/IPriceFeed";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { UpdaterRSK } from "../typechain/UpdaterRSK";
import { BigNumber } from "@ethersproject/bignumber";
import { ContractsNames as PriceFeedContractNames } from "../deploy/7_deploy_price_feeds";
import type { Contract } from "ethers";

export function load() {
  task("update:all")
    .addParam("btcusd", "BTCUSD price")
    .addParam("btceth", "BTCETH price")
    .addParam("eurusd", "EURUSD price")
    .setAction(async ({ btcusd, btceth, eurusd }, hre) => {
      const signer = await getBot(hre);

      if (hre.network.name == "rsk") {
        console.log("starting sovryn swap price oracles updates");
        const oracleEthUsd = await getSovrynFeed_RbtcUsd(hre);
        await (await oracleEthUsd.updateOracleWithVerification(to_d12(btcusd))).wait();
        console.log("updated ETH / USD (RSK BTC / USD)");

        const oracleBtcEth = await getSovrynFeed_RbtcEths(hre);
        await (await oracleBtcEth.updateOracleWithVerification(to_d12(btceth))).wait();
        console.log("updated BTC / ETH (same on both networks)");

        console.log("starting fiat to fiat oracles updates");
        const oracleEurUsd = await getFiatToFiat_EurUsd(hre);
        await (await oracleEurUsd.setPrice(to_d12(eurusd))).wait();
        console.log("updated EUR / USD");
      }

      console.log("starting uniswap pairs oracles updates");
      await updateUniswapPairsOracles(hre, signer);

      console.log("starting refresh collateral ratio");
      const stables = await getAllBDStables(hre);

      for (const stable of stables) {
        await (await stable.connect(signer).refreshCollateralRatio()).wait();
        console.log(`${await stable.symbol()} refreshed collateral ratio`);
      }
    });

  task("update:btceth:rsk")
    .addParam("btceth", "BTCETH price")
    .setAction(async ({ btceth }, hre) => {
      if (hre.network.name != "rsk") {
        throw new Error("RSK only task");
      }

      const signer = await getBot(hre);

      const oracleBtcEth = (await hre.ethers.getContract(PriceFeedContractNames.BtcToEthOracle, signer)) as SovrynSwapPriceFeed;
      await (await oracleBtcEth.updateOracleWithVerification(to_d12(btceth))).wait();
      console.log("updated RSK BTC/ETH (same on both networks)");
    });

  task("update:eurusd:rsk")
    .addPositionalParam("eurusd", "EURUSD price")
    .setAction(async ({ eurusd }, hre) => {
      if (hre.network.name != "rsk") {
        throw new Error("RSK only task");
      }
      const deployer = await getDeployer(hre);
      const oracleEurUsd = (await hre.ethers.getContract(PriceFeedContractNames.priceFeedEurUsdName, deployer)) as FiatToFiatPseudoOracleFeed;
      await (await oracleEurUsd.connect(deployer).setPrice(to_d12(eurusd))).wait();
      console.log("updated EUR / USD");
    });

  task("update:eurusd:maxDayChange:rsk")
    .addPositionalParam("change", "Max day change")
    .setAction(async ({ change }, hre) => {
      if (hre.network.name != "rsk") {
        throw new Error("RSK only task");
      }

      if (change < 0.01 || change > 0.1) {
        throw new Error("Mach day change shlud be between 0.01 and 0.1");
      }

      const deployer = await getDeployer(hre);
      const oracleEurUsd = (await hre.ethers.getContract(PriceFeedContractNames.priceFeedEurUsdName, deployer)) as FiatToFiatPseudoOracleFeed;
      await (await oracleEurUsd.connect(deployer).setMaxDayChange_d12(to_d12(change))).wait();
      console.log("updated EUR / USD max day change");
    });

  task("reset:uniswap-oracles").setAction(async (args, hre) => {
    await resetUniswapPairsOracles(hre);
  });

  task("update:uniswap-oracles-as-deployer").setAction(async (args, hre) => {
    const deployer = await getDeployer(hre);
    await updateUniswapPairsOracles(hre, deployer);
  });

  task("update:all-with-updater")
    .addParam("btcusd", "BTCUSD price")
    .addParam("btceth", "BTCETH price")
    .addParam("eurusd", "EURUSD price")
    .setAction(async ({ btcusd, btceth, eurusd }, hre) => {
      console.log("starting the updater");

      const bot = await getBot(hre);
      const updater = (await hre.ethers.getContract("UpdaterRSK", bot)) as UpdaterRSK;

      const uniOracles = [];
      const pools = await getPools(hre);
      for (const pool of pools) {
        const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        uniOracles.push(oracle.address);
      }

      const oracleEthUsd = await getSovrynFeed_RbtcUsd(hre);
      const oracleBtcEth = await getSovrynFeed_RbtcEths(hre); // this one is not inverted
      const oracleEurUsd = await getFiatToFiat_EurUsd(hre);

      const sovrynOracles = [formatAddress(hre, oracleEthUsd.address), formatAddress(hre, oracleBtcEth.address)];
      const sovrynPrices = [to_d12(btcusd), to_d12(btceth)];

      const fiatToFiatOracles = [formatAddress(hre, oracleEurUsd.address)];
      const fiatToFiatPrices = [to_d12(eurusd)];

      const stablesAddresses = (await getAllBDStables(hre)).map(stable => stable.address);
      await (await updater.update(sovrynOracles, sovrynPrices, fiatToFiatOracles, fiatToFiatPrices, uniOracles, stablesAddresses)).wait();

      console.log("updater has updated");
    });

  async function isSameOwner(owner: string, contract: Contract): Promise<boolean> {
    const currentOwner = await contract.owner();
    return currentOwner.toLowerCase() === owner.toLowerCase();
  }

  task("set:owner")
    .addPositionalParam("owner", "owner address")
    .setAction(async ({ owner }, hre) => {
      console.log(`set:owner ${owner} on ${hre.network.name}`);
      const deployer = await getDeployer(hre);
      if (hre.network.name == "rsk") {
        const oracleEthUsd = (await hre.ethers.getContract(PriceFeedContractNames.priceFeedETHUsdName, deployer)) as SovrynSwapPriceFeed;
        if (!(await isSameOwner(owner, oracleEthUsd))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.priceFeedETHUsdName} to ${owner}`);
          await (await oracleEthUsd.transferOwnership(owner)).wait();
        }

        const oracleBtcEth = (await hre.ethers.getContract(PriceFeedContractNames.BtcToEthOracle, deployer)) as SovrynSwapPriceFeed;
        if (!(await isSameOwner(owner, oracleBtcEth))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.BtcToEthOracle} to ${owner}`);
          await (await oracleBtcEth.transferOwnership(owner)).wait();
        }

        const oracleEurUsd = (await hre.ethers.getContract(PriceFeedContractNames.priceFeedEurUsdName, deployer)) as FiatToFiatPseudoOracleFeed;
        if (!(await isSameOwner(owner, oracleEurUsd))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.priceFeedEurUsdName} to ${owner}`);
          await (await oracleEurUsd.transferOwnership(owner)).wait();
        }
      }

      const pools = await getPools(hre);
      for (const pool of pools) {
        const uniOracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        if (!(await isSameOwner(owner, uniOracle))) {
          console.log(`transfer ownership on uniswap pair oracle ${pool[0].name}-${pool[1].name} to ${owner}`);
          await (await uniOracle.transferOwnership(owner)).wait();
        }
      }

      const stables = await getAllBDStables(hre);
      for (const stable of stables) {
        if (!(await isSameOwner(owner, stable))) {
          console.log(`transfer ownership on BDStable ${await stable.name()} to ${owner}`);
          await (await stable.transferOwnership(owner)).wait();
        }
      }

      const stablePools = await getAllBDStablePools(hre);
      for (const stablePool of stablePools) {
        if (!(await isSameOwner(owner, stablePool))) {
          console.log(`transfer ownership on BDStablePool ${stablePool.address} to ${owner}`);
          await (await stablePool.transferOwnership(owner)).wait();
        }
      }

      const bdx = await getBdx(hre);
      if (!(await isSameOwner(owner, bdx))) {
        console.log(`transfer ownership on BDXShares ${bdx.address} to ${owner}`);
        await (await bdx.transferOwnership(owner)).wait();
      }

      const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
      if (!(await isSameOwner(owner, stakingRewardsDistribution))) {
        console.log(`transfer ownership on stakingRewardsDistribution contract ${stakingRewardsDistribution.address} to ${owner}`);
        await (await stakingRewardsDistribution.transferOwnership(owner)).wait();
      }

      const stakingRewards = await getAllBDStableStakingRewards(hre);
      for (const stakingReward of stakingRewards) {
        if (!(await isSameOwner(owner, stakingReward))) {
          console.log(`transfer ownership on stakingReward contract ${stakingReward.address} to ${owner}`);
          await (await stakingReward.transferOwnership(owner)).wait();
        }
      }

      const vesting = await getVesting(hre);
      if (!(await isSameOwner(owner, vesting))) {
        console.log(`transfer ownership on vesting contract ${vesting.address} to ${owner}`);
        await (await vesting.transferOwnership(owner)).wait();
      }
      const updater = await getUpdater(hre);
      if (!(await isSameOwner(owner, updater))) {
        console.log(`transfer ownership on updater ${updater.address} to ${owner}`);
        await (await updater.transferOwnership(owner)).wait();
      }

      console.log(`All ownership transfered to ${owner}`);
    });

  task("set:updater")
    .addPositionalParam("newUpdater", "new updater address")
    .setAction(async ({ newUpdater }, hre) => {
      console.log("starting the setUpdaters to:", newUpdater);

      const networkName = hre.network.name;
      const deployer = await getDeployer(hre);
      const oracleEthUsd = (await hre.ethers.getContract(PriceFeedContractNames.priceFeedETHUsdName, deployer)) as SovrynSwapPriceFeed;
      const oracleBtcEth = (await hre.ethers.getContract(PriceFeedContractNames.BtcToEthOracle, deployer)) as SovrynSwapPriceFeed;
      const oracleEurUsd = (await hre.ethers.getContract(PriceFeedContractNames.priceFeedEurUsdName, deployer)) as FiatToFiatPseudoOracleFeed;

      if (networkName == "rsk") {
        await (await oracleEthUsd.setUpdater(newUpdater)).wait();
        console.log("updated oracleEthUsd");

        await (await oracleBtcEth.setUpdater(newUpdater)).wait();
        console.log("updated oracleBtcEth");

        await (await oracleEurUsd.setUpdater(newUpdater)).wait();
        console.log("updated oracleEurUsd");
      }

      console.log("updaters set");
    });

  async function isSameTreasury(treasury: string, contract: Contract): Promise<boolean> {
    const currentTreasury = await contract.treasury();
    return currentTreasury.toLowerCase() === treasury.toLowerCase();
  }

  task("set:treasury")
    .addPositionalParam("treasury", "new treasury address")
    .setAction(async ({ treasury }, hre) => {
      console.log(`set:treasury ${treasury} on ${hre.network.name}`);

      const stables = await getAllBDStables(hre);
      for (const stable of stables) {
        if (!(await isSameTreasury(treasury, stable))) {
          await (await stable.setTreasury(treasury)).wait();
          console.log(`${await stable.name()} treasury set to ${treasury}`);
        }
      }

      const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
      if (!(await isSameTreasury(treasury, stakingRewardsDistribution))) {
        await (await stakingRewardsDistribution.setTreasury(treasury)).wait();
        console.log(`StakingRewardsDistribution treasury set to ${treasury}`);
      }
    });

  task("set:oracles:ConsultLeniency")
    .addPositionalParam("newVal", "new value")
    .setAction(async ({ newVal }, hre) => {
      const pools = await getPools(hre);

      console.log("setting consultLeniency to: " + newVal);

      for (const pool of pools) {
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
      for (const pool of pools) {
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
        throw "invalid cr value";
      }

      const deployer = await getDeployer(hre);

      const stable = (await hre.ethers.getContractAt("BDStable", formatAddress(hre, stableAddress))) as BDStable;
      await (await stable.connect(deployer).lockCollateralRatioAt(to_d12(val))).wait();
    });

  task("set:stable-toggleCollateralRatioPaused")
    .addPositionalParam("stableAddress", "stable address")
    .setAction(async ({ stableAddress }, hre) => {
      const deployer = await getDeployer(hre);

      const stable = (await hre.ethers.getContractAt("BDStable", formatAddress(hre, stableAddress))) as BDStable;
      await (await stable.connect(deployer).toggleCollateralRatioPaused()).wait();
    });

  task("set:rsk-eur-usd")
    .addPositionalParam("newPrice", "new price")
    .setAction(async ({ newPrice }, hre) => {
      if (hre.network.name != "rsk") {
        throw new Error("RSK only task");
      }
      const bot = await hre.ethers.getNamedSigner("BOT");

      if (newPrice < 0.5 || newPrice > 2) {
        throw "invalid price";
      }

      console.log("Setting EUR/USD: " + newPrice);

      const feed = (await hre.ethers.getContract(PriceFeedContractNames.priceFeedEurUsdName)) as FiatToFiatPseudoOracleFeed;
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

  task("show:oracles-prices").setAction(async (args, hre) => {
    await show_uniswapOraclesPrices(hre, true);
  });

  task("show:pools").setAction(async (args, hre) => {
    const pools = await getPools(hre);

    for (const pool of pools) {
      const pair = await getUniswapPair(hre, pool[0].token, pool[1].token);
      console.log(`${pool[0].name} / ${pool[1].name} : ${pair.address}`);
      console.log(`\t${pool[0].token.address} / ${pool[1].token.address}`);
    }
  });

  task("show:pool-reserves")
    .addPositionalParam("pairAddress", "pair address")
    .setAction(async ({ pairAddress }, hre) => {
      const pair = (await hre.ethers.getContractAt("UniswapV2Pair", formatAddress(hre, pairAddress))) as UniswapV2Pair;
      const reserves = await pair.getReserves();
      console.log(`Reserves: ${d18_ToNumber(reserves[0])} ${d18_ToNumber(reserves[1])}`);
    });

  task("show:users").setAction(async (args, hre) => {
    const deployer = await getDeployer(hre);
    const treasury = await getTreasury(hre);
    const bot = await getBot(hre);

    console.log("deployer: " + deployer.address);
    console.log("treasury: " + treasury.address);
    console.log("bot     : " + bot.address);
  });

  task("show:bdeu:ef-bdx-cov").setAction(async (args, hre) => {
    await show_efBDXCov(await getBdEu(hre));
  });

  task("show:bdus:ef-bdx-cov").setAction(async (args, hre) => {
    await show_efBDXCov(await getBdUs(hre));
  });

  task("show:rsk-eur-usd").setAction(async (args, hre) => {
    if (hre.network.name != "rsk") {
      throw new Error("RSK only task");
    }
    await show_eurUsd(hre);
  });

  task("show:rsk-eth-usd").setAction(async (args, hre) => {
    if (hre.network.name != "rsk") {
      throw new Error("RSK only task");
    }
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

      const stables = await getAllBDStables(hre);

      for (const stable of stables) {
        await show_efCR(stable);
        await show_CR(stable);
        await show_efBDXCov(stable);
      }
    });

  async function show_ethEur(hre: HardhatRuntimeEnvironment) {
    const feed = (await hre.ethers.getContract(PriceFeedContractNames.oracleEthEurName)) as IOracleBasedCryptoFiatFeed;
    const price = d12_ToNumber(await feed.getPrice_1e12());
    console.log("ETH/EUR (RSK: BTC/EUR): " + price);
  }

  async function show_ethUsd(hre: HardhatRuntimeEnvironment) {
    const feed = (await hre.ethers.getContract(PriceFeedContractNames.oracleEthUsdName)) as IOracleBasedCryptoFiatFeed;
    const price = d12_ToNumber(await feed.getPrice_1e12());
    console.log("ETH/USD (RSK: BTC/USD): " + price);
  }

  async function show_btcEth(hre: HardhatRuntimeEnvironment) {
    let price;
    if (hre.network.name == "rsk") {
      const feed = (await hre.ethers.getContract(PriceFeedContractNames.BtcToEthOracle)) as IPriceFeed;
      price = bigNumberToDecimal(await feed.price(), await feed.decimals());
    } else {
      const feed = (await hre.ethers.getContract(PriceFeedContractNames.BtcToEthOracle)) as BtcToEthOracleChinlink;
      price = d12_ToNumber(await feed.getPrice_1e12());
    }
    console.log("BTC/ETH (same on both networks): " + price);
  }

  async function show_eurUsd(hre: HardhatRuntimeEnvironment) {
    const feed = (await hre.ethers.getContract(PriceFeedContractNames.priceFeedEurUsdName)) as IPriceFeed;
    const price = bigNumberToDecimal(await feed.price(), await feed.decimals());
    let lastUpdateTimestamp = 0;
    if (hre.network.name == "rsk") {
      const feedConcrete = feed as FiatToFiatPseudoOracleFeed;
      lastUpdateTimestamp = await (await feedConcrete.lastUpdateTimestamp()).toNumber();
    }

    console.log("EUR/USD: " + price + " last updated: " + new Date(lastUpdateTimestamp * 1000));
  }

  async function show_efBDXCov(stable: BDStable) {
    const efBdxCov = await stable.get_effective_bdx_coverage_ratio();
    console.log(`${await stable.symbol()} efBDXCov: ${d12_ToNumber(efBdxCov)}`);
  }

  async function show_efCR(stable: BDStable) {
    const efCR = await stable.effective_global_collateral_ratio_d12();
    console.log(`${await stable.symbol()} efCR: ${d12_ToNumber(efCR)}`);
  }

  async function show_CR(stable: BDStable) {
    const efCR = await stable.global_collateral_ratio_d12();
    console.log(`${await stable.symbol()} CR: ${d12_ToNumber(efCR)}`);
  }

  async function show_uniswapOraclesPrices(hre: HardhatRuntimeEnvironment, showPrices: boolean) {
    const pools = await getPools(hre);

    for (const pool of pools) {
      const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
      const updatedAgo = new Date().getTime() / 1000 - (await oracle.blockTimestampLast());

      const pair = await getUniswapPair(hre, pool[0].token, pool[1].token);
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

      console.log(`       liquidity: ${reserves[0].toString()}  |  ${reserves[1].toString()}`);
    }
  }
}
