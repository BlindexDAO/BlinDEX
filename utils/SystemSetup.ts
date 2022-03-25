import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { numberToBigNumberFixed, to_d12, to_d18, to_d8 } from "./NumbersHelpers";
import {
  getBdEu,
  getBdx,
  getWeth,
  getWbtc,
  mintWbtc,
  getOnChainEthEurPrice,
  getOnChainBtcEurPrice,
  getDeployer,
  getTreasury,
  mintWeth,
  getBDStableWethPool,
  getBDStableWbtcPool,
  getBdUs,
  getOnChainWethUsdPrice,
  getOnChainWbtcUsdPrice,
  getAllBDStablePools
} from "./DeployedContractsHelpers";
import * as constants from "./Constants";
import { resetUniswapPairsOracles, updateUniswapPairsOracles } from "./UniswapPoolsHelpers";
import { provideLiquidity } from "../test/helpers/swaps";
import type { IERC20 } from "../typechain/IERC20";
import { getUsdcFor } from "./LocalHelpers";

export async function setupProductionReadySystem(
  hre: HardhatRuntimeEnvironment,
  btcEur: number,
  btcUsd: number,
  bdxEur: number,
  bdxUsd: number,
  ethEur: number,
  ethUsd: number,
  usdEur: number
) {
  await setUpFunctionalSystem(hre, 1, 1, false, btcEur, btcUsd, bdxEur, bdxUsd, ethEur, ethUsd, usdEur);
}

export async function setupLocalSystem(
  hre: HardhatRuntimeEnvironment,
  btcEur: number,
  btcUsd: number,
  bdxEur: number,
  bdxUsd: number,
  ethEur: number,
  ethUsd: number,
  usdEur: number
) {
  await setUpFunctionalSystem(hre, 0.7, 1, false, btcEur, btcUsd, bdxEur, bdxUsd, ethEur, ethUsd, usdEur);
}

export async function setUpFunctionalSystemForTests(hre: HardhatRuntimeEnvironment, initialBDStableCollteralRatio: number) {
  // For tests we only need approximate prices
  const ethEur = 4093;
  const ethUsd = 4000;
  const btcEur = 50353;
  const btcUsd = 57000;
  const bdxEur = 0.89;
  const bdxUsd = 1;
  const usdEur = 0.88;

  await setUpFunctionalSystem(hre, initialBDStableCollteralRatio, 1, true, btcEur, btcUsd, bdxEur, bdxUsd, ethEur, ethUsd, usdEur);
}

export async function setUpFunctionalSystem(
  hre: HardhatRuntimeEnvironment,
  initialBDStableCollteralRatio: number,
  scale: number,
  forIntegrationTests: boolean,
  btcEur: number,
  btcUsd: number,
  bdxEur: number,
  bdxUsd: number,
  ethEur: number,
  ethUsd: number,
  usdEur: number
) {
  const deployer = await getDeployer(hre);
  const treasury = await getTreasury(hre);
  const weth = await getWeth(hre);
  const wbtc = await getWbtc(hre);
  const bdx = await getBdx(hre);
  const bdEu = await getBdEu(hre);
  const bdUs = await getBdUs(hre);

  let euroInitialWethPrice = ethEur;
  let euroInitialWbtcPrice = btcEur;

  let usdInitialWethPrice = ethUsd;
  let usdInitialWbtcPrice = btcUsd;

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
  }

  let wethDecimals;
  let wbtcDecimals;
  const verbose = !forIntegrationTests;

  if (hre.network.name === "rsk") {
    wethDecimals = 18;
    wbtcDecimals = 18;

    // swap btc eth price
    const euroOldInitialWethPrice = euroInitialWethPrice;
    euroInitialWethPrice = euroInitialWbtcPrice;
    euroInitialWbtcPrice = euroOldInitialWethPrice;

    const usdOldInitialWethPrice = usdInitialWethPrice;
    usdInitialWethPrice = usdInitialWbtcPrice;
    usdInitialWbtcPrice = usdOldInitialWethPrice;
  } else {
    wethDecimals = 18;
    wbtcDecimals = 8;

    euroInitialWethPrice = (await getOnChainEthEurPrice(hre)).price;
    euroInitialWbtcPrice = (await getOnChainBtcEurPrice(hre)).price;

    usdInitialWethPrice = await getOnChainWethUsdPrice(hre);
    usdInitialWbtcPrice = await getOnChainWbtcUsdPrice(hre);
  }

  if (hre.network.name === "mainnetFork") {
    verboseLog(verbose, "provide liquidity bdus/usdc");

    const usdc = (await hre.ethers.getContractAt("IERC20", constants.EXTERNAL_USD_STABLE[hre.network.name].address)) as IERC20;
    const amount = 100;

    await provideLiquidity(hre, treasury, bdUs, usdc, to_d18(amount), numberToBigNumberFixed(amount, 6), verbose);
  }

  if (hre.network.name === "mainnetFork") {
    verboseLog(verbose, "enable recllateralization");
    const pools = await getAllBDStablePools(hre);
    for (const pool of pools) {
      await (await pool.toggleRecollateralizeOnlyForOwner()).wait();
    }
  }

  verboseLog(verbose, "provide liquidity bdeu/weth");

  const eurValueForLiquidityForPoolSide_bdEu_weth = constants.INITIAL_BDEU_UNISWAP_EUR_AMOUNT * scale;
  await provideLiquidity(
    hre,
    treasury,
    bdEu,
    weth,
    to_d18(eurValueForLiquidityForPoolSide_bdEu_weth),
    numberToBigNumberFixed(eurValueForLiquidityForPoolSide_bdEu_weth, wethDecimals).mul(1e12).div(to_d12(euroInitialWethPrice)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdus/weth");

  const usdValueForLiquidityForPoolSide_bdUS_weth = constants.INITIAL_BDUS_UNISWAP_USD_AMOUNT * scale;
  await provideLiquidity(
    hre,
    treasury,
    bdUs,
    weth,
    to_d18(usdValueForLiquidityForPoolSide_bdUS_weth),
    numberToBigNumberFixed(usdValueForLiquidityForPoolSide_bdUS_weth, wethDecimals).mul(1e12).div(to_d12(usdInitialWethPrice)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdeu/wbtc");
  const eurValueForLiquidityForPoolSide_bdEu_wbtc = constants.INITIAL_BDEU_UNISWAP_EUR_AMOUNT * scale;
  await provideLiquidity(
    hre,
    treasury,
    bdEu,
    wbtc,
    to_d18(eurValueForLiquidityForPoolSide_bdEu_wbtc),
    numberToBigNumberFixed(eurValueForLiquidityForPoolSide_bdEu_wbtc, wbtcDecimals).mul(1e12).div(to_d12(euroInitialWbtcPrice)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdus/wbtc");
  const usdValueForLiquidityForPoolSide_bdUS_wbtc = constants.INITIAL_BDUS_UNISWAP_USD_AMOUNT * scale;
  await provideLiquidity(
    hre,
    treasury,
    bdUs,
    wbtc,
    to_d18(usdValueForLiquidityForPoolSide_bdUS_wbtc),
    numberToBigNumberFixed(usdValueForLiquidityForPoolSide_bdUS_wbtc, wbtcDecimals).mul(1e12).div(to_d12(usdInitialWbtcPrice)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdx/weth");
  const eurValueForLiquidityForPoolSide_bdx_weth = constants.INITIAL_BDX_UNISWAP_EUR_AMOUNT * scale;
  await provideLiquidity(
    hre,
    treasury,
    bdx,
    weth,
    to_d18(eurValueForLiquidityForPoolSide_bdx_weth / bdxEur),
    numberToBigNumberFixed(eurValueForLiquidityForPoolSide_bdx_weth, wethDecimals).mul(1e12).div(to_d12(euroInitialWethPrice)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdx/wbtc");
  const eurValueForLiquidityForPoolSide_bdx_wbtc = constants.INITIAL_BDX_UNISWAP_EUR_AMOUNT * scale;
  await provideLiquidity(
    hre,
    treasury,
    bdx,
    wbtc,
    to_d18(eurValueForLiquidityForPoolSide_bdx_wbtc / bdxEur),
    numberToBigNumberFixed(eurValueForLiquidityForPoolSide_bdx_wbtc, wbtcDecimals).mul(1e12).div(to_d12(euroInitialWbtcPrice)),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdx/bdeu");

  const eurValueForLiquidityForPoolSide_bdx_bdEu = constants.INITIAL_BDX_UNISWAP_EUR_AMOUNT * scale;
  await provideLiquidity(
    hre,
    treasury,
    bdx,
    bdEu,
    to_d18(eurValueForLiquidityForPoolSide_bdx_bdEu / bdxEur),
    to_d18(eurValueForLiquidityForPoolSide_bdx_bdEu),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdx/bdus");

  const usdValueForLiquidityForPoolSide_bdx_bdUS = constants.INITIAL_BDX_UNISWAP_USD_AMOUNT * scale;
  await provideLiquidity(
    hre,
    treasury,
    bdx,
    bdUs,
    to_d18(usdValueForLiquidityForPoolSide_bdx_bdUS / bdxUsd),
    to_d18(usdValueForLiquidityForPoolSide_bdx_bdUS),
    verbose
  );

  verboseLog(verbose, "provide liquidity bdeu/bdus");

  const eurValueForLiquidityForPoolSide_bdEU_bdUS = constants.INITIAL_BDEU_UNISWAP_EUR_AMOUNT * scale;
  await provideLiquidity(
    hre,
    treasury,
    bdUs,
    bdEu,
    to_d18(eurValueForLiquidityForPoolSide_bdEU_bdUS / usdEur),
    to_d18(eurValueForLiquidityForPoolSide_bdEU_bdUS),
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
    const initialBdstableMinting = constants.initialBdstableMintingAmount(hre.network.name);

    const WETH_RATIO = 5; // Represents 50%
    const WRBTC_RATIO = 5; // Represents 50%
    const euroCollateralWeth = initialBdstableMinting
      .mul(to_d12(scale))
      .div(1e12)
      .mul(WETH_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(euroInitialWethPrice))
      .div(1e12);
    const euroCollateralWbtc = initialBdstableMinting
      .mul(to_d12(scale))
      .div(1e12)
      .mul(WRBTC_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(euroInitialWbtcPrice))
      .div(1e10)
      .div(1e12);
    const usdCollateralWeth = initialBdstableMinting
      .mul(to_d12(scale))
      .div(1e12)
      .mul(WETH_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(euroInitialWethPrice))
      .div(1e12);
    const usdCollateralWbtc = initialBdstableMinting
      .mul(to_d12(scale))
      .div(1e12)
      .mul(WRBTC_RATIO)
      .mul(initialBDStableColltFraction_d12)
      .div(10)
      .mul(1e12)
      .div(to_d12(euroInitialWbtcPrice))
      .div(1e10)
      .div(1e12);

    // Recallateralize by just sending the tokens in order not to extract undeserved BDX
    const bdEuWethPool = await getBDStableWethPool(hre, await bdEu.symbol());
    const bdEuWbtcPool = await getBDStableWbtcPool(hre, await bdEu.symbol());
    await (await weth.connect(treasury).transfer(bdEuWethPool.address, euroCollateralWeth)).wait();
    await (await wbtc.connect(treasury).transfer(bdEuWbtcPool.address, euroCollateralWbtc)).wait();

    const bdUSWethPool = await getBDStableWethPool(hre, await bdUs.symbol());
    const bdUSWbtcPool = await getBDStableWbtcPool(hre, await bdUs.symbol());
    await (await weth.connect(treasury).transfer(bdUSWethPool.address, usdCollateralWeth)).wait();
    await (await wbtc.connect(treasury).transfer(bdUSWbtcPool.address, usdCollateralWbtc)).wait();

    await (await bdEu.refreshCollateralRatio()).wait();
    await (await bdUs.refreshCollateralRatio()).wait();
  }
}

function verboseLog(verbose: boolean, message: string) {
  if (verbose) {
    console.log(message);
  }
}
