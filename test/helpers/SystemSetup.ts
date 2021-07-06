import { HardhatRuntimeEnvironment } from "hardhat/types";
import { to_d12, to_d18, to_d8 } from "../../utils/Helpers";
import { getBdEur, getBdx, getWeth, getWbtc, getBdEurWethPool, getBdEurWbtcPool, getUniswapPair } from "./common";
import * as constants from '../../utils/Constants';
import { ERC20 } from "../../typechain/ERC20";
import { UniswapV2Router02__factory } from "../../typechain/factories/UniswapV2Router02__factory";
import { BigNumber } from '@ethersproject/bignumber';
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import { provideLiquidity } from "./swaps";

export async function setUpFunctionalSystem(hre: HardhatRuntimeEnvironment, initialBdEurColltFraction: number = 1) {
    const deployer = await hre.ethers.getNamedSigner('DEPLOYER_ADDRESS');

    const weth = await getWeth(hre);
    const wbtc = await getWbtc(hre);

    const bdx = await getBdx(hre);
    const bdEur = await getBdEur(hre);
    const bdEurWethPool = await getBdEurWethPool(hre);
    const bdEurWbtcPool = await getBdEurWbtcPool(hre);

    // mint initial BDX
    await bdx.mint(deployer.address, to_d18(1e5));

    // mint initial WETH
    await weth.deposit({ value: to_d18(100) });

    // mint inital WBTC
    const uniRouter = UniswapV2Router02__factory.connect(constants.uniswapRouterAddress, deployer)
    const networkName = hre.network.name;
    await uniRouter.swapExactETHForTokens(0, [constants.wETH_address[networkName], constants.wBTC_address[networkName]], deployer.address,  Date.now() + 3600, {
      value: BigNumber.from(10).pow(20)
    })

    // todo all should be adjusted by the amonut of initial BdStables minted for the owner and current collateral prices
    const initialWethBdEurPrice = 1600;
    const initialWbtcBdEurPrice = 25000;
    const initialWethBdxPrice = 100;
    const initialWbtcBdxPrice = 1000;
    const initialBdxBdEurPrice = Math.round(initialWethBdEurPrice/initialWethBdxPrice);

    await provideLiquidity(hre, deployer, weth, bdEur, to_d18(1000).div(initialWethBdEurPrice), to_d18(1000));
    await provideLiquidity(hre, deployer, wbtc, bdEur, to_d8(1000).div(initialWbtcBdEurPrice), to_d18(1000));
    await provideLiquidity(hre, deployer, weth, bdx, to_d18(1000).div(initialWethBdxPrice), to_d18(1000));
    await provideLiquidity(hre, deployer, wbtc, bdx, to_d8(1000).div(initialWbtcBdxPrice), to_d18(1000));
    await provideLiquidity(hre, deployer, bdx, bdEur, to_d8(1000).div(initialBdxBdEurPrice), to_d18(1000));

    await simulateTimeElapseInSeconds(60*60+1); // wait the uniswap pair oracla update period
    
    await updateOracle(hre, weth, bdEur);
    await updateOracle(hre, wbtc, bdEur);
    await updateOracle(hre, weth, bdx);
    await updateOracle(hre, wbtc, bdx);
    await updateOracle(hre, bdx, bdEur);

    if(initialBdEurColltFraction > 0){
      // recollateralize missing value for initial BdStable for the owner

      const initialBdEurColltFraction_d12 = to_d12(initialBdEurColltFraction);

      const collateralWeth_d18 = constants.initalBdStableToOwner_d18[hre.network.name]
        .mul(7).mul(initialBdEurColltFraction_d12).div(10).div(initialWethBdEurPrice).div(1e12); // 70% in weth
      const collateralWbtc_d8 = constants.initalBdStableToOwner_d18[hre.network.name]
        .mul(2).mul(initialBdEurColltFraction_d12).div(10).div(initialWbtcBdEurPrice).div(1e10).div(1e12); // 30% in wbtc
      
      await weth.approve(bdEurWethPool.address, collateralWeth_d18);
      await bdEurWethPool.recollateralizeBdStable(collateralWeth_d18, to_d18(1))

      await wbtc.approve(bdEurWbtcPool.address, collateralWbtc_d8);
      await bdEurWbtcPool.recollateralizeBdStable(collateralWbtc_d8, to_d18(1));
    }

    await bdEur.refreshCollateralRatio();
}

async function updateOracle(
  hre: HardhatRuntimeEnvironment,
  tokenA: ERC20,
  tokenB: ERC20) 
{
  const pair = await getUniswapPair(hre, tokenA, tokenB);
  await pair.updateOracle();
}