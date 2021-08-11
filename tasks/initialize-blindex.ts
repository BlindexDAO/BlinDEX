import { UniswapV2Router02__factory } from './../typechain/factories/UniswapV2Router02__factory';
import { ERC20__factory } from './../typechain/factories/ERC20__factory';
import { BDXShares } from './../typechain/BDXShares.d';
import { UniswapV2Pair__factory } from './../typechain/factories/UniswapV2Pair__factory';
import { UniswapV2Factory } from './../typechain/UniswapV2Factory.d';
import { StakingRewards } from './../typechain/StakingRewards.d';
import { BDStable } from './../typechain/BDStable.d';
import { UniswapV2Router02 } from './../typechain/UniswapV2Router02.d';
import { BdStablePool } from './../typechain/BdStablePool.d';
import { BigNumber } from '@ethersproject/bignumber';
import { WETH__factory } from './../typechain/factories/WETH__factory';
import { task } from 'hardhat/config';
import * as constants from '../utils/Constants'
import TimeTraveler from '../utils/TimeTraveler';
import { UniswapPairOracle } from '../typechain/UniswapPairOracle';

task("initialize-blindex", "initialized blindex environment", async (args, hre) => {
    const networkName = hre.network.name;
    const [account] = await hre.ethers.getSigners();
  
    //Get some weth
    const weth = WETH__factory.connect(constants.wETH_address[networkName], account)
    await weth.deposit({
      value: BigNumber.from(10).pow(21)
    })

    //Get some BDEU
    const bdeuWethPool = await hre.ethers.getContract('BDEU_WETH_POOL') as BdStablePool
    ;(await weth.approve(bdeuWethPool.address, BigNumber.from(10).pow(20))).wait()
    await (await bdeuWethPool.mint1t1BD(BigNumber.from(10).pow(20), 0)).wait();
    const bdeu = await hre.ethers.getContract('BDEU') as BDStable
    const bdeuBalance = await bdeu.balanceOf(account.address);
    console.log(bdeuBalance.toString())

    //Deposit into pair
    const router = await hre.ethers.getContract('UniswapV2Router02') as UniswapV2Router02
    ;(await weth.approve(router.address, BigNumber.from(10).pow(20))).wait()
    await bdeu.approve(router.address, bdeuBalance);
    await (await router.addLiquidity(constants.wETH_address[networkName], bdeu.address,
      BigNumber.from(10).pow(20), bdeuBalance,
      BigNumber.from(10).pow(20), bdeuBalance,
      account.address, Date.now() + 3600
    )).wait()
    const factory = await hre.ethers.getContract('UniswapV2Factory') as UniswapV2Factory
    const pairAddress = await factory.getPair(constants.wETH_address[networkName], bdeu.address)
    const pair = await UniswapV2Pair__factory.connect(pairAddress, account)
    const lpTokenBalance = await pair.balanceOf(account.address);

    //Stake tokens
    const stakingReward = await hre.ethers.getContract('StakingRewards_BDEU_WETH') as StakingRewards
    await pair.approve(stakingReward.address, lpTokenBalance)
    await (await stakingReward.stake(lpTokenBalance)).wait();
    
    //Accrue some BDX
    if (!['rinkeby', 'kovan', 'mainnetFork'].includes(hre.network.name)) {
      const timeTraveler = new TimeTraveler(hre.network.provider);
      await timeTraveler.increaseTime(3600);
    }

    //Get BDX
    console.log(await stakingReward.earned(account.address))
    await (await stakingReward.getReward()).wait();
    const bdx = await hre.ethers.getContract('BDXShares') as BDXShares
    const bdxBalance = await bdx.balanceOf(account.address);

    //Initialize BDX pair
    ;(await weth.approve(router.address, BigNumber.from(10).pow(20))).wait()
    await bdx.approve(router.address, bdxBalance)
    await (await router.addLiquidity(constants.wETH_address[networkName], bdx.address,
      BigNumber.from(10).pow(16), bdxBalance,
      BigNumber.from(10).pow(16), bdxBalance,
      account.address, Date.now() + 3600
    )).wait()
    
    //Get some wBTC
    const uniRouter = UniswapV2Router02__factory.connect(constants.uniswapRouterAddress, account)
    await uniRouter.swapExactETHForTokens(0, [constants.wETH_address[networkName], constants.wBTC_address[networkName]], account.address,  Date.now() + 3600, {
      value: BigNumber.from(10).pow(20)
    })
    const wbtc = ERC20__factory.connect(constants.wBTC_address[networkName], account)
    const wbtcBalance = await wbtc.balanceOf(account.address)
    await wbtc.approve(router.address, wbtcBalance);
    await weth.approve(router.address, BigNumber.from(10).pow(20));

    await (await router.addLiquidity(constants.wETH_address[networkName], wbtc.address,
      BigNumber.from(10).pow(20), wbtcBalance,
      BigNumber.from(10).pow(20), wbtcBalance,
      account.address, Date.now() + 3600
    )).wait()

    //Update prices in oracle
    const bdx_eth_oracle_instance = await hre.ethers.getContract('UniswapPairOracle_BDX_WETH') as UniswapPairOracle
    const bdeu_eth_oracle_instance = await hre.ethers.getContract('UniswapPairOracle_BDEU_WETH') as UniswapPairOracle
    await (await bdx_eth_oracle_instance.update()).wait()
    await (await bdeu_eth_oracle_instance.update()).wait()
    
  });