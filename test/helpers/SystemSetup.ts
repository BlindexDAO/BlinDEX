import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { to_d18 } from "../../utils/Helpers";
import { getBdEur, getBdx, getWeth, getWbtc, getBdEurWethPool, getUniswapRouter } from "./common";
import * as constants from '../../utils/Constants';
import { BDStable } from "../../typechain/BDStable";
import { BdStablePool } from "../../typechain/BdStablePool";
import { WETH } from "../../typechain/WETH";
import { UniswapV2Router02 } from "../../typechain/UniswapV2Router02";
import { ERC20 } from "../../typechain/ERC20";
import { UniswapV2Router02__factory } from "../../typechain/factories/UniswapV2Router02__factory";
import { BigNumber } from '@ethersproject/bignumber';

export async function setUpFunctionalSystem(hre: HardhatRuntimeEnvironment, superuser: SignerWithAddress) {
    const deployer = await hre.ethers.getNamedSigner('DEPLOYER_ADDRESS');

    const weth = await getWeth(hre);
    const wbtc = await getWbtc(hre);

    const bdx = await getBdx(hre);
    const bdEur = await getBdEur(hre);
    const bdEurPool = await getBdEurWethPool(hre);

    // mint initial BDX
    await bdx.mint(superuser.address, to_d18(1e5));

    // mint initial WETH
    await weth.deposit({ value: to_d18(100) });

    // mint inital WBTC
    const uniRouter = UniswapV2Router02__factory.connect(constants.uniswapRouterAddress, superuser)
    const networkName = hre.network.name;
    await uniRouter.swapExactETHForTokens(0, [constants.wETH_address[networkName], constants.wBTC_address[networkName]], superuser.address,  Date.now() + 3600, {
      value: BigNumber.from(10).pow(20)
    })

    // todo ag mock function, should be replaced in the future
    // extracts collateral form user's account
    // assings bdeur to the user
    // probably use mint1to1
    await bdEurPool.connect(superuser).mintBdStable(to_d18(1e4));

    provideLiquidity(hre, superuser, weth, bdEur, 1, 1600);
    provideLiquidity(hre, superuser, wbtc, bdEur, 1, 25000);
    provideLiquidity(hre, superuser, weth, bdx, 1, 100);
    provideLiquidity(hre, superuser, wbtc, bdx, 1, 1000);
}

async function provideLiquidity(
  hre: HardhatRuntimeEnvironment,
  superuser: SignerWithAddress,
  tokenA: ERC20,
  tokenB: ERC20,
  amountA: number,
  amountB: number
){
  const router = await getUniswapRouter(hre);

  // add liquidity to the uniswap pool (weth-bdeur)
  // reveive LP tokens
  await tokenA.connect(superuser).approve(router.address, to_d18(amountA));
  await tokenB.connect(superuser).approve(router.address, to_d18(amountB));

  const currentBlock = await hre.ethers.provider.getBlock("latest");

  // router routes to the proper pair
  await router.connect(superuser).addLiquidity(
    tokenA.address, 
    tokenB.address, 
    to_d18(amountA), 
    to_d18(amountB), 
    to_d18(amountA), 
    to_d18(amountB), 
    superuser.address, 
    currentBlock.timestamp + 60);
}