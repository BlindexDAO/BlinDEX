import { HardhatRuntimeEnvironment } from "hardhat/types";
import { numberToBigNumberFixed, to_d12, to_d18, to_d8 } from "./NumbersHelpers";
import {
  getBdEu, getBdx, getWeth, getWbtc, getBdEuWethPool, getBdEuWbtcPool, mintWbtc, getOnChainEthEurPrice,
  getOnChainBtcEurPrice, getDeployer, getTreasury, mintWeth
} from "./DeployedContractsHelpers";
import * as constants from './Constants';
import { resetUniswapPairsOracles, updateUniswapPairsOracles } from "./UniswapPoolsHelpers";
import { provideLiquidity } from "../test/helpers/swaps";

export async function setUpFunctionalSystemForTests(hre: HardhatRuntimeEnvironment, initialBdEuColltFraction: number) {
  await setUpFunctionalSystem(hre, initialBdEuColltFraction, 1000, true);
}

export async function setUpFunctionalSystemSmall(hre: HardhatRuntimeEnvironment) {
  await setUpFunctionalSystem(hre, 1e-6, 1, false);
}

export async function setUpFunctionalSystem(
  hre: HardhatRuntimeEnvironment,
  initialBdEuColltFraction: number,
  eurValueForLiquidity: number,
  forIntegrationTests: boolean
) {
  const deployer = await getDeployer(hre);
  const treasury = await getTreasury(hre);

  const weth = await getWeth(hre);
  const wbtc = await getWbtc(hre);

  const bdx = await getBdx(hre);
  const bdEu = await getBdEu(hre);
  const bdEuWethPool = await getBdEuWethPool(hre);
  const bdEuWbtcPool = await getBdEuWbtcPool(hre);

  // transfer initial BDX from treasury to owner
  await (await bdx.connect(treasury).transfer(deployer.address, to_d18(1e5))).wait();

  if (forIntegrationTests) {
    // mint initial WETH
    await mintWeth(hre, deployer, to_d18(100));
    // mint inital WBTC
    await mintWbtc(hre, deployer, to_d8(10));
  }

  // initial prices don't need to be very precise, in real world they will never be very precise
  let initialWethBdEuPrice = 4093; //todo ag from parameter s
  let initialWbtcBdEuPrice = 50353; //todo ag from parameters
  let initialBdxBdEuPrice = 100; //todo ag from parameters

  let wethDecimals;
  let wbtcDecimals;
  let verbose;

  if (hre.network.name == "rsk") {
    wethDecimals = 18;
    wbtcDecimals = 18;
    verbose = true;

    // swap btc eth price
    const oldInitialWethBdEuPrice = initialWethBdEuPrice;
    initialWethBdEuPrice = initialWbtcBdEuPrice;
    initialWbtcBdEuPrice = oldInitialWethBdEuPrice;
  } else {
    wethDecimals = 18;
    wbtcDecimals = 8;
    verbose = false;

    initialWethBdEuPrice = (await getOnChainEthEurPrice(hre)).price;
    initialWbtcBdEuPrice = (await getOnChainBtcEurPrice(hre)).price;
  }

  verboseLog(verbose, "privide liquidity bdeu/weth");
  await provideLiquidity(hre, deployer, bdEu, weth,
    to_d18(eurValueForLiquidity),
    numberToBigNumberFixed(eurValueForLiquidity, wethDecimals).mul(1e12).div(to_d12(initialWethBdEuPrice)),
    verbose);

  verboseLog(verbose, "privide liquidity bdeu/wbtc");
  await provideLiquidity(hre, deployer, bdEu, wbtc,
    to_d18(eurValueForLiquidity),
    numberToBigNumberFixed(eurValueForLiquidity, wbtcDecimals).mul(1e12).div(to_d12(initialWbtcBdEuPrice)),
    verbose);

  verboseLog(verbose, "privide liquidity bdx/weth");
  await provideLiquidity(hre, deployer, bdx, weth,
    to_d18(eurValueForLiquidity / initialBdxBdEuPrice),
    numberToBigNumberFixed(eurValueForLiquidity, wethDecimals).mul(1e12).div(to_d12(initialWethBdEuPrice)),
    verbose);

  verboseLog(verbose, "privide liquidity bdx/wbtc");
  await provideLiquidity(hre, deployer, bdx, wbtc,
    to_d18(eurValueForLiquidity / initialBdxBdEuPrice),
    numberToBigNumberFixed(eurValueForLiquidity, wbtcDecimals).mul(1e12).div(to_d12(initialWbtcBdEuPrice)),
    verbose);

  verboseLog(verbose, "privide liquidity bdx/bdeu");
  await provideLiquidity(hre, deployer, bdx, bdEu,
    to_d18(eurValueForLiquidity / initialBdxBdEuPrice),
    to_d18(eurValueForLiquidity),
    verbose);

  verboseLog(verbose, "privide liquidity - done");

  await resetUniswapPairsOracles(hre);
  verboseLog(verbose, "oracles reset");
  await updateUniswapPairsOracles(hre);
  verboseLog(verbose, "oracles updated");

  if (initialBdEuColltFraction > 0) {
    // recollateralize missing value for initial BdStable for the owner

    const initialBdEuColltFraction_d12 = to_d12(initialBdEuColltFraction);

    const collateralWeth = constants.initalBdStableToOwner_d18[hre.network.name]
      .mul(7).mul(initialBdEuColltFraction_d12).div(10).mul(1e12).div(to_d12(initialWethBdEuPrice)).div(1e12); // 70% in weth
    const collateralWbtc = constants.initalBdStableToOwner_d18[hre.network.name]
      .mul(3).mul(initialBdEuColltFraction_d12).div(10).mul(1e12).div(to_d12(initialWbtcBdEuPrice)).div(1e10).div(1e12); // 30% in wbtc

    // recallateralize by just sending the tokens in order not to extract undeserved BDX
    await (await weth.connect(deployer).transfer(bdEuWethPool.address, collateralWeth)).wait();
    await (await wbtc.connect(deployer).transfer(bdEuWbtcPool.address, collateralWbtc)).wait();

    await bdEu.refreshCollateralRatio();
  }
}

function verboseLog(verbose: boolean, message: string) {
  if (verbose) {
    console.log(message);
  }
}