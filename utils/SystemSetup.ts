import { HardhatRuntimeEnvironment } from "hardhat/types";
import { numberToBigNumberFixed, to_d12, to_d18, to_d8 } from "./NumbersHelpers";
import {
  getBdEu, getBdx, getWeth, getWbtc, getBdEuWethPool, getBdEuWbtcPool, mintWbtc, getOnChainEthEurPrice,
  getOnChainBtcEurPrice, getDeployer, getTreasury, mintWeth
} from "./DeployedContractsHelpers";
import * as constants from './Constants';
import { resetUniswapPairsOracles, updateUniswapPairsOracles } from "./UniswapPoolsHelpers";
import { provideLiquidity } from "../test/helpers/swaps";

export async function setupProductionReadySystem(hre: HardhatRuntimeEnvironment){
  await setUpFunctionalSystem(hre, 1, 1, false);
}

export async function setUpFunctionalSystemForTests(hre: HardhatRuntimeEnvironment, initialBdEuColltFraction: number) {
  await setUpFunctionalSystem(hre, initialBdEuColltFraction, 1, true);
}

export async function setUpFunctionalSystem(
  hre: HardhatRuntimeEnvironment,
  initialBdEuColltFraction: number,
  scale: number,
  forIntegrationTests: boolean) {
  const deployer = await getDeployer(hre);
  const treasury = await getTreasury(hre);

  const weth = await getWeth(hre);
  const wbtc = await getWbtc(hre);

  const bdx = await getBdx(hre);
  const bdEu = await getBdEu(hre);
  const bdEuWethPool = await getBdEuWethPool(hre);
  const bdEuWbtcPool = await getBdEuWbtcPool(hre);

  const tresuryBdEuBalance = await bdEu.balanceOf(treasury.address);

  if (forIntegrationTests) {
    // mint initial WETH
    await mintWeth(hre, deployer, to_d18(100));
    // mint inital WBTC
    await mintWbtc(hre, deployer, to_d8(10), 100);

    // mint initial WETH
    await mintWeth(hre, treasury, to_d18(100));
    // mint inital WBTC
    await mintWbtc(hre, treasury, to_d8(10), 100);

    // deployer needs some bdeu in tests
    await bdEu.connect(treasury).transfer(deployer.address, tresuryBdEuBalance.div(10));
  }

  // initial prices don't need to be very precise, in real world they will never be very precise
  // prices are in EUR
  let initialWethBdEuPrice = 4093; //todo ag from parameters
  let initialWbtcBdEuPrice = 50353; //todo ag from parameters
  let initialBdxBdEuPrice = 0.89; //todo ag from parameters

  let wethDecimals;
  let wbtcDecimals;
  const verbose = !forIntegrationTests;

  if (hre.network.name == "rsk") {
    wethDecimals = 18;
    wbtcDecimals = 18;

    // swap btc eth price
    const oldInitialWethBdEuPrice = initialWethBdEuPrice;
    initialWethBdEuPrice = initialWbtcBdEuPrice;
    initialWbtcBdEuPrice = oldInitialWethBdEuPrice;
  } else {
    wethDecimals = 18;
    wbtcDecimals = 8;

    initialWethBdEuPrice = (await getOnChainEthEurPrice(hre)).price;
    initialWbtcBdEuPrice = (await getOnChainBtcEurPrice(hre)).price;
  }

  verboseLog(verbose, "provide liquidity bdeu/weth");

  const eurValueForLiquidityForPoolSide_bdEu_weth = constants.INITIAL_BDEU_UNISWAP_EUR_AMOUNT * scale;
  await provideLiquidity(hre, treasury, bdEu, weth,
    to_d18(eurValueForLiquidityForPoolSide_bdEu_weth),
    numberToBigNumberFixed(eurValueForLiquidityForPoolSide_bdEu_weth, wethDecimals).mul(1e12).div(to_d12(initialWethBdEuPrice)),
    verbose);
  
  verboseLog(verbose, "provide liquidity bdeu/wbtc");
  const eurValueForLiquidityForPoolSide_bdEu_wbtc = constants.INITIAL_BDEU_UNISWAP_EUR_AMOUNT * scale;
  await provideLiquidity(hre, treasury, bdEu, wbtc,
    to_d18(eurValueForLiquidityForPoolSide_bdEu_wbtc),
    numberToBigNumberFixed(eurValueForLiquidityForPoolSide_bdEu_wbtc, wbtcDecimals).mul(1e12).div(to_d12(initialWbtcBdEuPrice)),
    verbose);

  verboseLog(verbose, "provide liquidity bdx/weth");
  const eurValueForLiquidityForPoolSide_bdx_weth = constants.INITIAL_BDX_UNISWAP_EUR_AMOUNT * scale;
  await provideLiquidity(hre, treasury, bdx, weth,
    to_d18(eurValueForLiquidityForPoolSide_bdx_weth / initialBdxBdEuPrice),
    numberToBigNumberFixed(eurValueForLiquidityForPoolSide_bdx_weth, wethDecimals).mul(1e12).div(to_d12(initialWethBdEuPrice)),
    verbose);

  verboseLog(verbose, "provide liquidity bdx/wbtc");
  const eurValueForLiquidityForPoolSide_bdx_wbtc = constants.INITIAL_BDX_UNISWAP_EUR_AMOUNT * scale;
  await provideLiquidity(hre, treasury, bdx, wbtc,
    to_d18(eurValueForLiquidityForPoolSide_bdx_wbtc / initialBdxBdEuPrice),
    numberToBigNumberFixed(eurValueForLiquidityForPoolSide_bdx_wbtc, wbtcDecimals).mul(1e12).div(to_d12(initialWbtcBdEuPrice)),
    verbose);

  verboseLog(verbose, "provide liquidity bdx/bdeu");

  const eurValueForLiquidityForPoolSide_bdx_bdEu = constants.INITIAL_BDX_UNISWAP_EUR_AMOUNT * scale;
  await provideLiquidity(hre, treasury, bdx, bdEu,
    to_d18(eurValueForLiquidityForPoolSide_bdx_bdEu / initialBdxBdEuPrice),
    to_d18(eurValueForLiquidityForPoolSide_bdx_bdEu),
    verbose);

  verboseLog(verbose, "provide liquidity - done");

  await resetUniswapPairsOracles(hre);
  verboseLog(verbose, "oracles reset");
  await updateUniswapPairsOracles(hre, deployer);
  verboseLog(verbose, "oracles updated");

  if (initialBdEuColltFraction > 0) {
    // Since we minted BDstable and sent it to the treasury, we're now missing collateral to cover for these minted tokens.
    // We'll overcome this by transffering collateral to the BDstable pools
    // We'll NOT use the recallateralize funciton in this case so we won't lock BDX in the deployer address for no reason

    const initialBdEuColltFraction_d12 = to_d12(initialBdEuColltFraction);
    const initialBdstableMinting = constants.initialBdstableMintingAmount(hre.network.name);
    const WETH_RATIO = 5; // Represents 50%
    const WRBTC_RATIO = 5; // Represents 50%
    const collateralWeth = initialBdstableMinting.mul(to_d12(scale)).div(1e12)
      .mul(WETH_RATIO).mul(initialBdEuColltFraction_d12).div(10).mul(1e12).div(to_d12(initialWethBdEuPrice)).div(1e12);
    const collateralWbtc = initialBdstableMinting.mul(to_d12(scale)).div(1e12)
      .mul(WRBTC_RATIO).mul(initialBdEuColltFraction_d12).div(10).mul(1e12).div(to_d12(initialWbtcBdEuPrice)).div(1e10).div(1e12);

    // recallateralize by just sending the tokens in order not to extract undeserved BDX
    await (await weth.connect(treasury).transfer(bdEuWethPool.address, collateralWeth)).wait();
    await (await wbtc.connect(treasury).transfer(bdEuWbtcPool.address, collateralWbtc)).wait();

    await bdEu.refreshCollateralRatio();
  }
}

function verboseLog(verbose: boolean, message: string) {
  if (verbose) {
    console.log(message);
  }
}