import _ from "lodash";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { numberToBigNumberFixed, to_d12, to_d18, to_d8 } from "./NumbersHelpers";
import {
  getBdEu,
  getBdx,
  getWeth,
  getWbtc,
  mintWbtc,
  getOnChainWethFiatPrice,
  getOnChainWbtcFiatPrice,
  getDeployer,
  getTreasurySigner,
  mintWeth,
  getBDStableWethPool,
  getBDStableWbtcPool,
  getBdUs,
  getOnChainWethUsdPrice,
  getOnChainWbtcUsdPrice,
  getAllBDStablePools,
  getBxau,
  getBgbp,
  getAllBDStablesFiatSymbols
} from "./DeployedContractsHelpers";
import * as constants from "./Constants";
import { resetUniswapPairsOracles, updateUniswapPairsOracles } from "./UniswapPoolsHelpers";
import { provideLiquidity } from "../test/helpers/swaps";
import type { IERC20 } from "../typechain/IERC20";
import { getDaiFor, getUsdcFor } from "./LocalHelpers";

export type CollateralPrices = {
  NativeToken: { [symbol: string]: number };
  SecondaryCollateralToken: { [symbol: string]: number };
};

export async function setupProductionReadySystem(
  hre: HardhatRuntimeEnvironment,
  bdxEur: number,
  bdxUsd: number,
  bdxXau: number,
  bdxGbp: number,
  usdEur: number,
  initialPrice: CollateralPrices
) {
  await setUpFunctionalSystem(hre, 1, false, bdxEur, bdxUsd, bdxXau, bdxGbp, usdEur, initialPrice);
}

export async function setupLocalSystem(
  hre: HardhatRuntimeEnvironment,
  bdxEur: number,
  bdxUsd: number,
  bdxXau: number,
  bdxGbp: number,
  usdEur: number,
  initialPrice: CollateralPrices
) {
  await setUpFunctionalSystem(hre, 0.7, false, bdxEur, bdxUsd, bdxXau, bdxGbp, usdEur, initialPrice);
}

export async function setUpFunctionalSystemForTests(hre: HardhatRuntimeEnvironment, initialBDStableCollteralRatio: number) {
  // For tests we only need approximate prices
  const initialCollateralPrices: CollateralPrices = {
    NativeToken: {
      USD: 3200,
      EUR: 2900,
      XAU: 1.6,
      GBP: 2800
    },
    SecondaryCollateralToken: {
      USD: 43500,
      EUR: 39000,
      XAU: 22.3,
      GBP: 38000
    }
  };

  const bdxEur = 0.89;
  const bdxUsd = 1;
  const bdxXau = 0.00051;
  const bdxGbp = 0.75;
  const usdEur = 0.88;

  await setUpFunctionalSystem(hre, initialBDStableCollteralRatio, true, bdxEur, bdxUsd, bdxXau, bdxGbp, usdEur, initialCollateralPrices);
}

export async function setUpFunctionalSystem(
  hre: HardhatRuntimeEnvironment,
  initialBDStableCollteralRatio: number,
  forIntegrationTests: boolean,
  bdxEur: number,
  bdxUsd: number,
  bdxXau: number,
  bdxGbp: number,
  usdEur: number,
  initialCollateralPrices: CollateralPrices
) {
  const deployer = await getDeployer(hre);
  const treasury = await getTreasurySigner(hre);
  const weth = await getWeth(hre);
  const wbtc = await getWbtc(hre);
  const bdx = await getBdx(hre);
  const bdEu = await getBdEu(hre);
  const bdUs = await getBdUs(hre);
  const bxau = await getBxau(hre);
  const bgbp = await getBgbp(hre);

  if (forIntegrationTests) {
    // mint initial WETH
    await mintWeth(hre, deployer, to_d18(100));

    // mint inital WBTC
    await mintWbtc(hre, deployer, to_d8(10), 100);

    // mint initial WETH
    await mintWeth(hre, treasury, to_d18(100));

    // mint inital WBTC
    await mintWbtc(hre, treasury, to_d8(10), 100);

    // transfer some usdc to treasury
    await getUsdcFor(hre, treasury.address, 1000);

    // transfer some dai to treasury
    await getDaiFor(hre, treasury.address, 1000);
  }

  let wethDecimals;
  let wbtcDecimals;
  const verbose = !forIntegrationTests;

  // TODO: Multichain - What should we do here for other chains?
  if (hre.network.name === "rsk") {
    wethDecimals = 18;
    wbtcDecimals = 18;

    // swap btc eth price
    const oldInitialWethPrice = initialCollateralPrices.NativeToken;
    initialCollateralPrices.NativeToken = initialCollateralPrices.SecondaryCollateralToken;
    initialCollateralPrices.SecondaryCollateralToken = oldInitialWethPrice;
  } else {
    wethDecimals = 18;
    wbtcDecimals = 8;

    // Get stable prices from price feed
    await Promise.all(
      getAllBDStablesFiatSymbols().map(async symbol => {
        const onChainEthStablePrice = symbol === "USD" ? await getOnChainWethUsdPrice(hre) : (await getOnChainWethFiatPrice(hre, symbol)).price;
        _.set(initialCollateralPrices, ["NativeToken", symbol], onChainEthStablePrice);

        const onChainBtcStablePrice = symbol === "USD" ? await getOnChainWbtcUsdPrice(hre) : (await getOnChainWbtcFiatPrice(hre, symbol)).price;
        _.set(initialCollateralPrices, ["SecondaryCollateralToken", symbol], onChainBtcStablePrice);
      })
    );
  }

  if (hre.network.name === "mainnetFork") {
    verboseLog(verbose, "provide liquidity bdus/usdc");
    const usdc = (await hre.ethers.getContractAt("IERC20", constants.EXTERNAL_USD_STABLE[hre.network.name].address)) as IERC20;
    await provideLiquidity(
      hre,
      treasury,
      bdUs,
      usdc,
      to_d18(constants.INITIAL_USDC_UNISWAP_USD_AMOUNT),
      numberToBigNumberFixed(constants.INITIAL_USDC_UNISWAP_USD_AMOUNT, 6),
      verbose
    );

    verboseLog(verbose, "provide liquidity bdus/dai");
    const dai = (await hre.ethers.getContractAt("IERC20", constants.SECONDARY_EXTERNAL_USD_STABLE[hre.network.name].address)) as IERC20;
    await provideLiquidity(
      hre,
      treasury,
      bdUs,
      dai,
      to_d18(constants.INITIAL_DAI_UNISWAP_USD_AMOUNT),
      numberToBigNumberFixed(constants.INITIAL_DAI_UNISWAP_USD_AMOUNT, 18),
      verbose
    );

    verboseLog(verbose, "provide liquidity bxau/weth");
    const initialXauAmountForWeth = _.get(constants.initialLiquidityForPoolsWithCollateral, [hre.network.name, "bXAU"]);
    await provideLiquidity(
      hre,
      treasury,
      bxau,
      weth,
      to_d18(initialXauAmountForWeth),
      numberToBigNumberFixed(initialXauAmountForWeth, wethDecimals).mul(1e12).div(to_d12(initialCollateralPrices.NativeToken.XAU)),
      verbose
    );

    verboseLog(verbose, "provide liquidity bgbp/weth");
    const initialGbpAmountForWeth = _.get(constants.initialLiquidityForPoolsWithCollateral, [hre.network.name, "bGBP"]);
    await provideLiquidity(
      hre,
      treasury,
      bgbp,
      weth,
      to_d18(initialGbpAmountForWeth),
      numberToBigNumberFixed(initialGbpAmountForWeth, wethDecimals).mul(1e12).div(to_d12(initialCollateralPrices.NativeToken.GBP)),
      verbose
    );

    verboseLog(verbose, "provide liquidity bdx/bxau");
    const initialBdxAmountForBxau = _.get(constants.initialLiquidityForPoolsWithBDX, [hre.network.name, "bXAU"]);
    await provideLiquidity(hre, treasury, bdx, bxau, to_d18(initialBdxAmountForBxau / bdxXau), to_d18(initialBdxAmountForBxau), verbose);

    verboseLog(verbose, "provide liquidity bdx/bgbp");
    const initialBdxAmountForBgbp = _.get(constants.initialLiquidityForPoolsWithBDX, [hre.network.name, "bGBP"]);
    await provideLiquidity(hre, treasury, bdx, bgbp, to_d18(initialBdxAmountForBgbp / bdxGbp), to_d18(initialBdxAmountForBgbp), verbose);

    verboseLog(verbose, "verify recollateralizeOnlyForOwner = false");
    const pools = await getAllBDStablePools(hre);
    for (const pool of pools) {
      const recollateralizeOnlyForOwner = await pool.recollateralizeOnlyForOwner();
      if (recollateralizeOnlyForOwner) {
        await (await pool.toggleRecollateralizeOnlyForOwner()).wait();
      }
    }
  }

  verboseLog(verbose, "provide liquidity bdeu/weth");
  const initialBdeuAmountForPoolsWithCollateral = _.get(constants.initialLiquidityForPoolsWithCollateral, [hre.network.name, "BDEU"]);
  await provideLiquidity(
    hre,
    treasury,
    bdEu,
    weth,
    to_d18(initialBdeuAmountForPoolsWithCollateral),
    numberToBigNumberFixed(initialBdeuAmountForPoolsWithCollateral, wethDecimals).mul(1e12).div(to_d12(initialCollateralPrices.NativeToken.EUR)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdus/weth");
  const initialBdusAmountForPoolsWithCollateral = _.get(constants.initialLiquidityForPoolsWithCollateral, [hre.network.name, "BDUS"]);
  await provideLiquidity(
    hre,
    treasury,
    bdUs,
    weth,
    to_d18(initialBdusAmountForPoolsWithCollateral),
    numberToBigNumberFixed(initialBdusAmountForPoolsWithCollateral, wethDecimals).mul(1e12).div(to_d12(initialCollateralPrices.NativeToken.USD)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdeu/wbtc");
  await provideLiquidity(
    hre,
    treasury,
    bdEu,
    wbtc,
    to_d18(initialBdeuAmountForPoolsWithCollateral),
    numberToBigNumberFixed(initialBdeuAmountForPoolsWithCollateral, wbtcDecimals)
      .mul(1e12)
      .div(to_d12(initialCollateralPrices.SecondaryCollateralToken.EUR)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdus/wbtc");
  await provideLiquidity(
    hre,
    treasury,
    bdUs,
    wbtc,
    to_d18(initialBdusAmountForPoolsWithCollateral),
    numberToBigNumberFixed(initialBdusAmountForPoolsWithCollateral, wbtcDecimals)
      .mul(1e12)
      .div(to_d12(initialCollateralPrices.SecondaryCollateralToken.USD)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdx/weth");
  const initialBdxAmountForBdeu = _.get(constants.initialLiquidityForPoolsWithBDX, [hre.network.name, "BDEU"]);
  await provideLiquidity(
    hre,
    treasury,
    bdx,
    weth,
    to_d18(initialBdxAmountForBdeu / bdxEur),
    numberToBigNumberFixed(initialBdxAmountForBdeu, wethDecimals).mul(1e12).div(to_d12(initialCollateralPrices.NativeToken.EUR)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdx/wbtc");
  await provideLiquidity(
    hre,
    treasury,
    bdx,
    wbtc,
    to_d18(initialBdxAmountForBdeu / bdxEur),
    numberToBigNumberFixed(initialBdxAmountForBdeu, wbtcDecimals).mul(1e12).div(to_d12(initialCollateralPrices.SecondaryCollateralToken.EUR)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdx/bdeu");
  await provideLiquidity(hre, treasury, bdx, bdEu, to_d18(initialBdxAmountForBdeu / bdxEur), to_d18(initialBdxAmountForBdeu), verbose);

  verboseLog(verbose, "provide liquidity bdx/bdus");
  const initialBdxAmountForBdus = _.get(constants.initialLiquidityForPoolsWithBDX, [hre.network.name, "BDUS"]);
  await provideLiquidity(hre, treasury, bdx, bdUs, to_d18(initialBdxAmountForBdus / bdxUsd), to_d18(initialBdxAmountForBdus), verbose);

  verboseLog(verbose, "provide liquidity bdeu/bdus");
  await provideLiquidity(
    hre,
    treasury,
    bdUs,
    bdEu,
    to_d18(constants.INITIAL_BDEU_AMOUNT_FOR_BDUS_POOL / usdEur),
    to_d18(constants.INITIAL_BDEU_AMOUNT_FOR_BDUS_POOL),
    verbose
  );

  verboseLog(verbose, "Provide liquidity - done");

  await resetUniswapPairsOracles(hre);
  verboseLog(verbose, "oracles reset");
  await updateUniswapPairsOracles(hre, deployer);
  verboseLog(verbose, "oracles updated");

  if (initialBDStableCollteralRatio > 0) {
    // Since we minted BDstable and sent it to the treasury, we're now missing collateral to cover for these minted tokens.
    // We'll overcome this by transffering collateral to the BDstable pools
    // We'll NOT use the recallateralize funciton in this case so we won't lock BDX in the deployer address for no reason
    const initialBDStableColltFraction_d12 = to_d12(initialBDStableCollteralRatio);
    const WETH_RATIO = 5; // Represents 50%
    const WRBTC_RATIO = 5; // Represents 50%

    // Recallateralize by just sending the tokens in order not to extract undeserved BDX
    const initialBdeuMintingAmount = constants.initialBdstableMintingAmount(hre.network.name, "BDEU");
    const euroCollateralWeth = initialBdeuMintingAmount
      .mul(WETH_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(initialCollateralPrices.NativeToken.EUR))
      .div(1e12);
    const euroCollateralWbtc = initialBdeuMintingAmount
      .mul(WRBTC_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(initialCollateralPrices.SecondaryCollateralToken.EUR))
      .div(1e10)
      .div(1e12);
    const bdEuWethPool = await getBDStableWethPool(hre, await bdEu.symbol());
    const bdEuWbtcPool = await getBDStableWbtcPool(hre, await bdEu.symbol());
    await (await weth.connect(treasury).transfer(bdEuWethPool.address, euroCollateralWeth)).wait();
    await (await wbtc.connect(treasury).transfer(bdEuWbtcPool.address, euroCollateralWbtc)).wait();

    const initialBdusMintingAmount = constants.initialBdstableMintingAmount(hre.network.name, "BDUS");
    const usdCollateralWeth = initialBdusMintingAmount
      .mul(WETH_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(initialCollateralPrices.NativeToken.EUR))
      .div(1e12);
    const usdCollateralWbtc = initialBdusMintingAmount
      .mul(WRBTC_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(initialCollateralPrices.SecondaryCollateralToken.EUR))
      .div(1e10)
      .div(1e12);
    const bdUSWethPool = await getBDStableWethPool(hre, await bdUs.symbol());
    const bdUSWbtcPool = await getBDStableWbtcPool(hre, await bdUs.symbol());
    await (await weth.connect(treasury).transfer(bdUSWethPool.address, usdCollateralWeth)).wait();
    await (await wbtc.connect(treasury).transfer(bdUSWbtcPool.address, usdCollateralWbtc)).wait();

    const initialBxauMintingAmount = constants.initialBdstableMintingAmount(hre.network.name, "bXAU");
    const xauCollateralWeth = initialBxauMintingAmount
      .mul(WETH_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(initialCollateralPrices.NativeToken.XAU))
      .div(1e12);
    const xauCollateralWbtc = initialBxauMintingAmount
      .mul(WRBTC_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(initialCollateralPrices.SecondaryCollateralToken.XAU))
      .div(1e10)
      .div(1e12);
    const bXauWethPool = await getBDStableWethPool(hre, await bxau.symbol());
    const bXauWbtcPool = await getBDStableWbtcPool(hre, await bxau.symbol());
    await (await weth.connect(treasury).transfer(bXauWethPool.address, xauCollateralWeth)).wait();
    await (await wbtc.connect(treasury).transfer(bXauWbtcPool.address, xauCollateralWbtc)).wait();

    const initialBgbpMintingAmount = constants.initialBdstableMintingAmount(hre.network.name, "bGBP");
    const gbpCollateralWeth = initialBgbpMintingAmount
      .mul(WETH_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(initialCollateralPrices.NativeToken.GBP))
      .div(1e12);
    const gbpCollateralWbtc = initialBgbpMintingAmount
      .mul(WRBTC_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(initialCollateralPrices.SecondaryCollateralToken.GBP))
      .div(1e10)
      .div(1e12);
    const bGbpWethPool = await getBDStableWethPool(hre, await bgbp.symbol());
    const bGbpWbtcPool = await getBDStableWbtcPool(hre, await bgbp.symbol());
    await (await weth.connect(treasury).transfer(bGbpWethPool.address, gbpCollateralWeth)).wait();
    await (await wbtc.connect(treasury).transfer(bGbpWbtcPool.address, gbpCollateralWbtc)).wait();

    await (await bdEu.refreshCollateralRatio()).wait();
    await (await bdUs.refreshCollateralRatio()).wait();
  }
}

function verboseLog(verbose: boolean, message: string) {
  if (verbose) {
    console.log(message);
  }
}
