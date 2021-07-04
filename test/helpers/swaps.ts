import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signer-with-address";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BDStable } from "../../typechain/BDStable";
import { BdStablePool } from "../../typechain/BdStablePool";
import { BDXShares } from "../../typechain/BDXShares";
import { d18_ToNumber, to_d18, to_d8 } from "../../utils/Helpers";
import * as constants from '../../utils/Constants';
import { WETH } from "../../typechain/WETH";
import { UniswapV2Router02 } from "../../typechain/UniswapV2Router02";
import { StakingRewards } from "../../typechain/StakingRewards";
import { UniswapV2Factory } from "../../typechain/UniswapV2Factory";
import { ERC20 } from "../../typechain/ERC20";
import { bigNumberToDecimal } from "../../utils/Helpers";
import { getWethPair } from "../../utils/Swaps";
import { getDeployer, getUniswapRouter, getWeth } from "./common";

export async function updateWethPair(hre: HardhatRuntimeEnvironment, tokenName: string){
  var pair = await getWethPair(hre, tokenName);

  await pair.updateOracle();
}

export async function swapWethFor(hre: HardhatRuntimeEnvironment, bdStableName: string, wEthToSwap: number) {
  const bdStable = await hre.ethers.getContract(bdStableName) as BDStable;

  const testUser = await hre.ethers.getNamedSigner('TEST2');

  const uniswapV2Router02 = await hre.ethers.getContract('UniswapV2Router02', testUser) as UniswapV2Router02;

  const currentBlock = await hre.ethers.provider.getBlock("latest");

  const weth = await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], testUser.address) as WETH;
  await weth.deposit({ value: to_d18(100) });

  await weth.approve(uniswapV2Router02.address, to_d18(wEthToSwap));
  await uniswapV2Router02.swapExactTokensForTokens(
      to_d18(wEthToSwap),
      1,
      [constants.wETH_address[hre.network.name], bdStable.address],
      testUser.address,
      currentBlock.timestamp + 24*60*60*7);

  console.log("Swapped WETH for " + bdStableName);
}

export async function swapAsDeployer(
     hre: HardhatRuntimeEnvironment, 
     tokenInName: string,
     tokenOutName: string, 
     tokenInValue: number, 
     tokenOutMinValue: number)
  {
  const deployer = await getDeployer(hre);

  const tokenIn = await hre.ethers.getContract(tokenInName, deployer.address) as ERC20;
  const tokenOut = await hre.ethers.getContract(tokenOutName, deployer.address) as ERC20;

  await swapAsDeployerByContract(hre, tokenIn, tokenOut, tokenInValue, tokenOutMinValue);

  console.log(`Swapped ${tokenInName} for ${tokenOutName}`);
}

export async function swapWethAsDeployer(
  hre: HardhatRuntimeEnvironment, 
  tokenOutName: string, 
  wethInValue: number, 
  tokenMinOutValue: number)
{
  const deployer = await getDeployer(hre);

  const tokenIn = await getWeth(hre);
  const tokenOut = await hre.ethers.getContract(tokenOutName, deployer.address) as ERC20;

  await swapAsDeployerByContract(hre, tokenIn, tokenOut, wethInValue, tokenMinOutValue);

  console.log(`Swapped WETH for ${tokenOutName}"`);
}

export async function swapForWethAsDeployer(
  hre: HardhatRuntimeEnvironment, 
  tokenInName: string, 
  tokenInValue: number, 
  wethMinOutValue: number)
{
  const deployer = await getDeployer(hre);

  const tokenIn = await hre.ethers.getContract(tokenInName, deployer.address) as ERC20;
  const tokenOut = await getWeth(hre);

  await swapAsDeployerByContract(hre, tokenIn, tokenOut, tokenInValue, wethMinOutValue);

  console.log(`Swapped ${tokenInName} for WETH`);
}

export async function swapAsDeployerByContract(
  hre: HardhatRuntimeEnvironment, 
  tokenIn: ERC20,
  tokenOut: ERC20, 
  tokenInValue: number, 
  tokenOutMinValue: number)
{
const deployer = await getDeployer(hre);

const uniswapV2Router02 = await getUniswapRouter(hre);

const currentBlock = await hre.ethers.provider.getBlock("latest");

await tokenIn.approve(uniswapV2Router02.address, to_d18(tokenInValue));
await uniswapV2Router02.swapExactTokensForTokens(
   to_d18(tokenInValue),
   to_d18(tokenOutMinValue),
   [tokenIn.address, tokenOut.address],
   deployer.address,
   currentBlock.timestamp + 24*60*60*7);
}

export async function getPrices(hre: HardhatRuntimeEnvironment,bdStableName: string) {
  const bdStable = await hre.ethers.getContract(bdStableName) as unknown as BDStable;

  const testUser = await hre.ethers.getNamedSigner('TEST2');

  const uniswapV2Router02 = await hre.ethers.getContract('UniswapV2Router02', testUser) as unknown as UniswapV2Router02;

  const wethInBdStablePrice = await uniswapV2Router02.consult(constants.wETH_address[hre.network.name], to_d18(1), bdStable.address);
  const bdStableWethPrice = await uniswapV2Router02.consult(bdStable.address, to_d18(1), constants.wETH_address[hre.network.name]);

  const wethInBdStablePriceDecimal = bigNumberToDecimal(wethInBdStablePrice, 18);
  const bdStableInWethPriceDecimal = bigNumberToDecimal(bdStableWethPrice, 18);

  console.log(`WETH in ${bdStableName} price: ` + wethInBdStablePriceDecimal);
  console.log(`${bdStableName} in WETH price: ` + bdStableInWethPriceDecimal);

  return [wethInBdStablePriceDecimal, bdStableInWethPriceDecimal];
}

export async function provideLiquidity_WETH_BDEUR(
  hre: HardhatRuntimeEnvironment,
  amountWeth: number, 
  amountBdEur: number,
  user: SignerWithAddress)
{   
  const ownerUser = await hre.ethers.getNamedSigner('DEPLOYER_ADDRESS');
  const bdEur = await hre.ethers.getContract('BDEUR', ownerUser) as unknown as BDStable;

  bdEur.transfer(user.address, to_d18(amountBdEur));

  const weth = await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as unknown as WETH;
  // mint WETH fromETH
  await weth.connect(user).deposit({ value: to_d18(amountWeth) });

  const uniswapV2Router02 = await hre.ethers.getContract('UniswapV2Router02', ownerUser) as unknown as UniswapV2Router02;

  // add liquidity to the uniswap pool (weth-bdeur)
  // reveive LP tokens
  await weth.connect(user).approve(uniswapV2Router02.address, to_d18(amountWeth));
  await bdEur.connect(user).approve(uniswapV2Router02.address, to_d18(amountBdEur));

  const currentBlock = await hre.ethers.provider.getBlock("latest");

  // router routes to the proper pair
  await uniswapV2Router02.connect(user).addLiquidity(
    weth.address, 
    bdEur.address, 
    to_d18(amountWeth), 
    to_d18(amountBdEur), 
    to_d18(amountWeth), 
    to_d18(amountBdEur), 
    user.address, 
    currentBlock.timestamp + 60);

  const stakingRewards_BDEUR_WETH = await hre.ethers.getContract('StakingRewards_BDEUR_WETH', ownerUser) as unknown as StakingRewards;

  const uniswapFactory = await hre.ethers.getContract("UniswapV2Factory", ownerUser) as unknown as UniswapV2Factory;
  const swapPairAddress = await uniswapFactory.getPair(bdEur.address, weth.address);
  const lpToken_BdEur_WETH = await hre.ethers.getContractAt("ERC20", swapPairAddress, ownerUser) as unknown as ERC20;

  // approve LP tokens transfer to the liquidity rewards manager
  await lpToken_BdEur_WETH.connect(user).approve(stakingRewards_BDEUR_WETH.address, to_d18(100));
}

export async function provideLiquidity_BDEUR_WETH_userTest1(hre: HardhatRuntimeEnvironment, eurToEth: number){
  const userLiquidityProvider = await hre.ethers.getNamedSigner('TEST1');

  const amountWeth = 10;
  await provideLiquidity_WETH_BDEUR(hre, amountWeth, amountWeth*eurToEth, userLiquidityProvider);
}

export async function provideLiquidity_BDX_WETH_userTest1(hre: HardhatRuntimeEnvironment, bdxToEth: number){
  const userLiquidityProvider = await hre.ethers.getNamedSigner('TEST1');

  const ethAmount = 100;
  const bdxAmount = ethAmount * bdxToEth;

  await provideLiquidity_WETH_BDX(hre, ethAmount, bdxAmount, userLiquidityProvider);
}

export async function provideLiquidity_WETH_BDX(
  hre: HardhatRuntimeEnvironment,
  amountWeth: number, 
  amountBdx: number,
  user: SignerWithAddress)
{   
  const ownerUser = (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
  const bdx = await hre.ethers.getContract('BDXShares', ownerUser) as unknown as BDXShares;

  bdx.mint(user.address, to_d18(amountBdx));

  const uniswapFactory = await hre.ethers.getContract("UniswapV2Factory", ownerUser) as unknown as UniswapV2Factory;
  const swapPairAddress = await uniswapFactory.getPair(bdx.address, constants.wETH_address[hre.network.name]);

  const lpToken_Bdx_WETH = await hre.ethers.getContractAt("ERC20", swapPairAddress, ownerUser) as unknown as ERC20;

  const weth = await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as unknown as WETH;
  // mint WETH fromETH
  await weth.connect(user).deposit({ value: to_d18(amountWeth) });
  
  const uniswapV2Router02 = await hre.ethers.getContract('UniswapV2Router02', ownerUser) as unknown as UniswapV2Router02;

  // add liquidity to the uniswap pool (weth-bdx)
  // reveive LP tokens
  await weth.connect(user).approve(uniswapV2Router02.address, to_d18(amountWeth));
  await bdx.connect(user).approve(uniswapV2Router02.address, to_d18(amountBdx));
  
  const currentBlock = await hre.ethers.provider.getBlock("latest");

  // router routes to the proper pair
  await uniswapV2Router02.connect(user).addLiquidity(
    weth.address, 
    bdx.address, 
    to_d18(amountWeth), 
    to_d18(amountBdx), 
    to_d18(amountWeth), 
    to_d18(amountBdx), 
    user.address, 
    currentBlock.timestamp + 60);

  const stakingRewards_BDX_WETH = await hre.ethers.getContract('StakingRewards_BDX_WETH', ownerUser) as unknown as StakingRewards;

  // approve LP tokens transfer to the liquidity rewards manager
  await lpToken_Bdx_WETH.connect(user).approve(stakingRewards_BDX_WETH.address, to_d18(100));
}

export async function provideLiquidity_WBTC_BDEUR(
  hre: HardhatRuntimeEnvironment,
  amountWbtc: number, 
  amountBdEur: number,
  user: SignerWithAddress)
{   
  const ownerUser = await hre.ethers.getNamedSigner('DEPLOYER_ADDRESS');
  const bdEur = await hre.ethers.getContract('BDEUR', ownerUser) as unknown as BDStable;

  bdEur.transfer(user.address, to_d18(amountBdEur));

  const wbtc = await hre.ethers.getContractAt("ERC20", constants.wBTC_address[hre.network.name], ownerUser) as unknown as ERC20;

  const uniswapV2Router02 = await hre.ethers.getContract('UniswapV2Router02', ownerUser) as unknown as UniswapV2Router02;

  // add liquidity to the uniswap pool (weth-bdeur)
  // reveive LP tokens

  await wbtc.connect(user).approve(uniswapV2Router02.address, to_d8(amountWbtc));
  await bdEur.connect(user).approve(uniswapV2Router02.address, to_d18(amountBdEur));

  const currentBlock = await hre.ethers.provider.getBlock("latest");

  // router routes to the proper pair
  await uniswapV2Router02.connect(user).addLiquidity(
    wbtc.address, 
    bdEur.address, 
    to_d8(amountWbtc), 
    to_d18(amountBdEur), 
    to_d8(amountWbtc), 
    to_d18(amountBdEur), 
    user.address, 
    currentBlock.timestamp + 60);

  const stakingRewards_BDEUR_WBTC = await hre.ethers.getContract('StakingRewards_BDEUR_WBTC', ownerUser) as unknown as StakingRewards;

  const uniswapFactory = await hre.ethers.getContract("UniswapV2Factory", ownerUser) as unknown as UniswapV2Factory;
  const swapPairAddress = await uniswapFactory.getPair(bdEur.address, wbtc.address);
  const lpToken_BdEur_WBTC = await hre.ethers.getContractAt("ERC20", swapPairAddress, ownerUser) as unknown as ERC20;

  // approve LP tokens transfer to the liquidity rewards manager
  await lpToken_BdEur_WBTC.connect(user).approve(stakingRewards_BDEUR_WBTC.address, to_d18(100));
}