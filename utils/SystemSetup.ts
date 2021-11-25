import { HardhatRuntimeEnvironment } from "hardhat/types";
import { numberToBigNumberFixed, to_d12, to_d18 } from "./NumbersHelpers";
import { getBdEu, getBdx, getWeth, getWbtc, getBdEuWethPool, getBdEuWbtcPool, getUniswapPair, mintWbtc, getOnChainEthEurPrice, getOnChainBtcEurPrice, getUniswapPairOracle, getIERC20, getERC20, getDeployer, getTreasury, getWethConcrete, mintWeth } from "./DeployedContractsHelpers";
import * as constants from './Constants';
import { resetOracles, updateOracles } from "./UniswapPoolsHelpers";
import { provideLiquidity } from "../test/helpers/swaps";

export async function setUpFunctionalSystem(hre: HardhatRuntimeEnvironment, initialBdEuColltFraction: number = 1, forIntegrationTests: boolean) {
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

    await provideLiquidity(hre, deployer, bdEu, weth, to_d18(1000), numberToBigNumberFixed(1000, wethDecimals).mul(1e12).div(to_d12(initialWethBdEuPrice)));
    await provideLiquidity(hre, deployer, bdEu, wbtc, to_d18(1000), numberToBigNumberFixed(1000, wbtcDecimals).mul(1e12).div(to_d12(initialWbtcBdEuPrice)));
    await provideLiquidity(hre, deployer, bdx, weth, to_d18(1000), numberToBigNumberFixed(1000, wethDecimals).mul(1e12).div(to_d12(initialWethBdxPrice)));
    await provideLiquidity(hre, deployer, bdx, wbtc, to_d18(1000), numberToBigNumberFixed(1000, wbtcDecimals).mul(1e12).div(to_d12(initialWbtcBdxPrice)));
    await provideLiquidity(hre, deployer, bdx, bdEu, to_d18(1000).mul(1e12).div(to_d12(initialBdxBdEuPrice)), to_d18(1000));

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

export async function setUpMinimalFunctionalSystem(hre: HardhatRuntimeEnvironment) {
  const deployer = await hre.ethers.getNamedSigner('DEPLOYER');
  const treasury = await hre.ethers.getNamedSigner('TREASURY');

  const wethConcrete = await getWethConcrete(hre);
  const weth = await getWeth(hre);
  const wbtc = await getWbtc(hre);

  const bdx = await getBdx(hre);
  const bdEu = await getBdEu(hre);
  const bdEuWethPool = await getBdEuWethPool(hre);
  const bdEuWbtcPool = await getBdEuWbtcPool(hre);

  console.log("starting...");

  //transfer initial BDX from treasury to owner
  await (await bdx.connect(treasury).transfer(deployer.address, to_d18(1e3))).wait();
  console.log("transferred bdx to deployer");

  // different for different chains
  var wethDecimals = await wethConcrete.decimals();
  var wbtcDecimals = await wbtc.decimals();

  await provideLiquidity(hre, deployer, weth, bdEu, numberToBigNumberFixed(0.0002, wethDecimals), to_d18(11));
  console.log("provided weth / bdeu liquidity");

  await provideLiquidity(hre, deployer, wbtc, bdEu, numberToBigNumberFixed(0.0002, wbtcDecimals), to_d18(9));
  console.log("provided wbtc / bdeu liquidity");

  await provideLiquidity(hre, deployer, weth, bdx, numberToBigNumberFixed(0.0003, wethDecimals), to_d18(10));
  console.log("provided weth / bdx liquidity");

  await provideLiquidity(hre, deployer, wbtc, bdx, numberToBigNumberFixed(0.0003, wbtcDecimals), to_d18(9));
  console.log("provided wbtc / bdx liquidity");

  await provideLiquidity(hre, deployer, bdx, bdEu, to_d18(15), to_d18(10));
  console.log("provided bdx / bdeu liquidity");

  await resetOracles(hre);
  await updateOracles(hre);

  //recallateralize by just sending the tokens in order not to extract undeserved BDX
  await (await wethConcrete.connect(deployer).transfer(bdEuWethPool.address, to_d18(0.0001))).wait();
  console.log("recollateralized bdeu / weth pool");

  //recallateralize by just sending the tokens in order not to extract undeserved BDX
  await (await wethConcrete.connect(deployer).transfer(bdEuWbtcPool.address, to_d18(0.00009))).wait();
  console.log("recollateralized bdeu / wbtc pool");

  console.log("finished");
}