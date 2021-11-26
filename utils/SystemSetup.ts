import { HardhatRuntimeEnvironment } from "hardhat/types";
import { numberToBigNumberFixed, to_d12, to_d18 } from "./NumbersHelpers";
import { getBdEu, getBdx, getWeth, getWbtc, getBdEuWethPool, getBdEuWbtcPool, getUniswapPair, mintWbtc, getOnChainEthEurPrice, getOnChainBtcEurPrice, getUniswapPairOracle, getIERC20, getERC20, getDeployer, getTreasury, getWethConcrete, mintWeth } from "./DeployedContractsHelpers";
import * as constants from './Constants';
import { resetOracles, updateOracles } from "./UniswapPoolsHelpers";
import { provideLiquidity } from "../test/helpers/swaps";

export async function setUpFunctionalSystemForTests(hre: HardhatRuntimeEnvironment, initialBdEuColltFraction: number) {
  await setUpFunctionalSystem(hre, initialBdEuColltFraction, 1000, true);
}

export async function setUpFunctionalSystemSmall(hre: HardhatRuntimeEnvironment) {
  await setUpFunctionalSystem(hre, 1e-6, 1, false);
}

export async function setUpFunctionalSystem(hre: HardhatRuntimeEnvironment, initialBdEuColltFraction: number, eurValueForLiquidity: number, forIntegrationTests: boolean) {
    const deployer = await getDeployer(hre);
    const treasury = await getTreasury(hre);

    const weth = await getWeth(hre);
    const wbtc = await getWbtc(hre);

    const bdx = await getBdx(hre);
    const bdEu = await getBdEu(hre);
    const bdEuWethPool = await getBdEuWethPool(hre);
    const bdEuWbtcPool = await getBdEuWbtcPool(hre);

    // transfer initial BDX from treasury to owner
    await bdx.connect(treasury).transfer(deployer.address, to_d18(1e5));

    if(forIntegrationTests) {
      // mint initial WETH
      await mintWeth(hre, deployer, to_d18(100));
      // mint inital WBTC
      await mintWbtc(hre, deployer, to_d18(1000));
    }

    // initial prices don't need to be very precise, in real world they will never be very precise
    const initialWethBdEuPrice = (await getOnChainEthEurPrice(hre)).price;
    const initialWbtcBdEuPrice = (await getOnChainBtcEurPrice(hre)).price;
    const initialBdxBdEuPrice = 100;
    const initialWethBdxPrice = initialWethBdEuPrice / initialBdxBdEuPrice;
    const initialWbtcBdxPrice = initialWbtcBdEuPrice / initialBdxBdEuPrice;

    let wethDecimals = 18;
    let wbtcDecimals = 8;

    if(hre.network.name == "rsk"){
      wethDecimals = 18;
      wbtcDecimals = 18;
    }

    await provideLiquidity(hre, deployer, bdEu, weth, to_d18(eurValueForLiquidity), numberToBigNumberFixed(eurValueForLiquidity, wethDecimals).mul(1e12).div(to_d12(initialWethBdEuPrice)));
    await provideLiquidity(hre, deployer, bdEu, wbtc, to_d18(eurValueForLiquidity), numberToBigNumberFixed(eurValueForLiquidity, wbtcDecimals).mul(1e12).div(to_d12(initialWbtcBdEuPrice)));
    await provideLiquidity(hre, deployer, bdx, weth, to_d18(eurValueForLiquidity), numberToBigNumberFixed(eurValueForLiquidity, wethDecimals).mul(1e12).div(to_d12(initialWethBdxPrice)));
    await provideLiquidity(hre, deployer, bdx, wbtc, to_d18(eurValueForLiquidity), numberToBigNumberFixed(eurValueForLiquidity, wbtcDecimals).mul(1e12).div(to_d12(initialWbtcBdxPrice)));
    await provideLiquidity(hre, deployer, bdx, bdEu, to_d18(eurValueForLiquidity).mul(1e12).div(to_d12(initialBdxBdEuPrice)), to_d18(eurValueForLiquidity));

    await resetOracles(hre);
    await updateOracles(hre);

    if(initialBdEuColltFraction > 0){
      // recollateralize missing value for initial BdStable for the owner

      const initialBdEuColltFraction_d12 = to_d12(initialBdEuColltFraction);

      const collateralWeth_d18 = constants.initalBdStableToOwner_d18[hre.network.name]
        .mul(7).mul(initialBdEuColltFraction_d12).div(10).mul(1e12).div(to_d12(initialWethBdEuPrice)).div(1e12); // 70% in weth
      const collateralWbtc_d8 = constants.initalBdStableToOwner_d18[hre.network.name]
        .mul(3).mul(initialBdEuColltFraction_d12).div(10).mul(1e12).div(to_d12(initialWbtcBdEuPrice)).div(1e10).div(1e12); // 30% in wbtc

      // recallateralize by just sending the tokens in order not to extract undeserved BDX
      await weth.connect(deployer).transfer(bdEuWethPool.address, collateralWeth_d18);
      await wbtc.connect(deployer).transfer(bdEuWbtcPool.address, collateralWbtc_d8);

      await bdEu.refreshCollateralRatio();
    }
}