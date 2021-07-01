import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { to_d18, to_d8 } from "../../utils/Helpers";
import { getBdEur, getBdx, getWeth, getWbtc, getBdEurWethPool, getUniswapRouter } from "./common";
import * as constants from '../../utils/Constants';
import { BDStable } from "../../typechain/BDStable";
import { BdStablePool } from "../../typechain/BdStablePool";
import { WETH } from "../../typechain/WETH";
import { UniswapV2Router02 } from "../../typechain/UniswapV2Router02";
import { ERC20 } from "../../typechain/ERC20";
import { UniswapV2Router02__factory } from "../../typechain/factories/UniswapV2Router02__factory";
import { BigNumber } from '@ethersproject/bignumber';

export async function setUpFunctionalSystem(hre: HardhatRuntimeEnvironment) {
    const deployer = await hre.ethers.getNamedSigner('DEPLOYER_ADDRESS');

    const weth = await getWeth(hre);
    const wbtc = await getWbtc(hre);

    const bdx = await getBdx(hre);
    const bdEur = await getBdEur(hre);
    const bdEurPool = await getBdEurWethPool(hre);

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

    provideLiquidity(hre, deployer, weth, bdEur, to_d18(1000).div(initialWethBdEurPrice), to_d18(1000));
    provideLiquidity(hre, deployer, wbtc, bdEur, to_d8(1000).div(initialWbtcBdEurPrice), to_d18(1000));
    provideLiquidity(hre, deployer, weth, bdx, to_d18(1000).div(initialWethBdxPrice), to_d18(1000));
    provideLiquidity(hre, deployer, wbtc, bdx, to_d8(1000).div(initialWbtcBdxPrice), to_d18(1000));

    // recollateralize missing value for initial BdStable for the owner
    
}

async function provideLiquidity(
  hre: HardhatRuntimeEnvironment,
  superuser: SignerWithAddress,
  tokenA: ERC20,
  tokenB: ERC20,
  amountA: BigNumber,
  amountB: BigNumber
){
  const router = await getUniswapRouter(hre);

  // add liquidity to the uniswap pool (weth-bdeur)
  // reveive LP tokens
  await tokenA.connect(superuser).approve(router.address, amountA);
  await tokenB.connect(superuser).approve(router.address, amountB);

  const currentBlock = await hre.ethers.provider.getBlock("latest");

  // router routes to the proper pair
  await router.connect(superuser).addLiquidity(
    tokenA.address, 
    tokenB.address, 
    amountA, 
    amountB,
    amountA, 
    amountB, 
    superuser.address, 
    currentBlock.timestamp + 60);
}