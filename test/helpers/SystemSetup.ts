import { HardhatRuntimeEnvironment } from "hardhat/types";
import { to_d12, to_d18, to_d8 } from "../../utils/Helpers";
import { getBdEu, getBdx, getWeth, getWbtc, getBdEuWethPool, getBdEuWbtcPool, getUniswapPair, mintWbtc, getOnChainEthEurPrice, getOnChainBtcEurPrice } from "./common";
import * as constants from '../../utils/Constants';
import { ERC20 } from "../../typechain/ERC20";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import { provideLiquidity } from "./swaps";
import { ethers } from "ethers";

export async function setUpFunctionalSystem(hre: HardhatRuntimeEnvironment, initialBdEuColltFraction: number = 1, simulateTimeElapse: boolean = true) {
    const deployer = await hre.ethers.getNamedSigner('DEPLOYER');

    const weth = await getWeth(hre);
    const wbtc = await getWbtc(hre);

    const bdx = await getBdx(hre);
    const bdEu = await getBdEu(hre);
    const bdEuWethPool = await getBdEuWethPool(hre);
    const bdEuWbtcPool = await getBdEuWbtcPool(hre);

    // mint initial BDX
    await bdx.mint(ethers.constants.AddressZero, deployer.address, to_d18(1e5));

    // mint initial WETH
    await weth.deposit({ value: to_d18(100) });

    // mint inital WBTC
    await mintWbtc(hre, deployer, to_d18(1000));

    // initial prices don't need to be very precise, in real world they will never be very precise
    const initialWethBdEuPrice = (await getOnChainEthEurPrice(hre)).price;
    const initialWbtcBdEuPrice = (await getOnChainBtcEurPrice(hre)).price;
    const initialBdxBdEuPrice = 100;
    const initialWethBdxPrice = initialWethBdEuPrice / initialBdxBdEuPrice;
    const initialWbtcBdxPrice = initialWbtcBdEuPrice / initialBdxBdEuPrice;

    await provideLiquidity(hre, deployer, weth, bdEu, to_d18(1000).mul(1e12).div(to_d12(initialWethBdEuPrice)), to_d18(1000));
    await provideLiquidity(hre, deployer, wbtc, bdEu, to_d8(1000).mul(1e12).div(to_d12(initialWbtcBdEuPrice)), to_d18(1000));
    await provideLiquidity(hre, deployer, weth, bdx, to_d18(1000).mul(1e12).div(to_d12(initialWethBdxPrice)), to_d18(1000));
    await provideLiquidity(hre, deployer, wbtc, bdx, to_d8(1000).mul(1e12).div(to_d12(initialWbtcBdxPrice)), to_d18(1000));
    await provideLiquidity(hre, deployer, bdx, bdEu, to_d8(1000).mul(1e12).div(to_d12(initialBdxBdEuPrice)), to_d18(1000));

    if (simulateTimeElapse) {
        await simulateTimeElapseInSeconds(60*60+1); // wait the uniswap pair oracle update period
    }

    await updateOracle(hre, weth, bdEu);
    await updateOracle(hre, wbtc, bdEu);
    await updateOracle(hre, weth, bdx);
    await updateOracle(hre, wbtc, bdx);
    await updateOracle(hre, bdx, bdEu);

    if(initialBdEuColltFraction > 0){
      // recollateralize missing value for initial BdStable for the owner

      const initialBdEuColltFraction_d12 = to_d12(initialBdEuColltFraction);

      const collateralWeth_d18 = constants.initalBdStableToOwner_d18[hre.network.name]
        .mul(7).mul(initialBdEuColltFraction_d12).div(10).mul(1e12).div(to_d12(initialWethBdEuPrice)).div(1e12); // 70% in weth
      const collateralWbtc_d8 = constants.initalBdStableToOwner_d18[hre.network.name]
        .mul(3).mul(initialBdEuColltFraction_d12).div(10).mul(1e12).div(to_d12(initialWbtcBdEuPrice)).div(1e10).div(1e12); // 30% in wbtc
      
      await weth.approve(bdEuWethPool.address, collateralWeth_d18);
      await bdEuWethPool.recollateralizeBdStable(collateralWeth_d18, 1)

      await wbtc.approve(bdEuWbtcPool.address, collateralWbtc_d8);
      await bdEuWbtcPool.recollateralizeBdStable(collateralWbtc_d8, 1);
    }
}

export async function updateOracle(
  hre: HardhatRuntimeEnvironment,
  tokenA: ERC20,
  tokenB: ERC20) 
{
  const pair = await getUniswapPair(hre, tokenA, tokenB);
  await pair.updateOracle();
}
