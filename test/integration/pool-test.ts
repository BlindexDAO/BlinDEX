import { BigNumber } from 'ethers';
import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import {SignerWithAddress} from 'hardhat-deploy-ethers/dist/src/signer-with-address';
import { WETH } from "../../typechain/WETH";
import { BDStable } from "../../typechain/BDStable";
import { BdStablePool } from "../../typechain/BdStablePool";
import { UniswapV2Router02 } from "../../typechain/UniswapV2Router02";
import { StakingRewards } from "../../typechain/StakingRewards";
import { UniswapV2Factory } from "../../typechain/UniswapV2Factory";
import { ERC20 } from "../../typechain/ERC20";
import TimeTraveler from "../../utils/TimeTraveler"
import { BDXShares } from '../../typechain/BDXShares';

chai.use(solidity);
const { expect } = chai;

function toErc20(n: number): BigNumber {
  return BigNumber.from(10).pow(18).mul(n)
}

function erc20ToNumber(n: BigNumber): Number {
  return Number(n.toString()) / 1e18;
}

let WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const timeTraveler = new TimeTraveler(hre.network.provider);
const bdxFirstYearSchedule = toErc20(21000000).mul(20).div(100);
const bdxPerSecondFirstYear = bdxFirstYearSchedule.div(365*24*60*60);
const rewardsSupply =  toErc20(21e6/2)

let ownerUser: SignerWithAddress;
let testUser1: SignerWithAddress;
let testUser2: SignerWithAddress;

let weth: WETH;
let bdStablePool: BdStablePool;
let bdEur: BDStable;
let bdx: BDXShares;
let uniswapV2Router02: UniswapV2Router02;
let stakingRewards_BDEUR_WETH: StakingRewards;
let uniswapFactory: UniswapV2Factory;  

let swapPairAddress: string;
let lpToken_BdEur_WETH: ERC20;

async function initialize(){
  ownerUser = await hre.ethers.getNamedSigner('POOL_CREATOR');
  testUser1 = await hre.ethers.getNamedSigner('TEST1');
  testUser2 = await hre.ethers.getNamedSigner('TEST2');
  WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  weth = await hre.ethers.getContractAt("WETH", WETH_ADDRESS, ownerUser) as unknown as WETH;
  bdStablePool = await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;
  bdEur = await hre.ethers.getContract('BDEUR', ownerUser) as unknown as BDStable;
  bdx = await hre.ethers.getContract('BDXShares', ownerUser) as unknown as BDXShares;
  uniswapV2Router02 = await hre.ethers.getContract('UniswapV2Router02', ownerUser) as unknown as UniswapV2Router02;
  stakingRewards_BDEUR_WETH = await hre.ethers.getContract('StakingRewards_BDEUR_WETH', ownerUser) as unknown as StakingRewards;
  uniswapFactory = await hre.ethers.getContract("UniswapV2Factory", ownerUser) as unknown as UniswapV2Factory;  

  swapPairAddress = await uniswapFactory.getPair(bdEur.address, weth.address);
  lpToken_BdEur_WETH = await hre.ethers.getContractAt("ERC20", swapPairAddress, ownerUser) as unknown as ERC20;
}

before(function() {
  return initialize();
})

async function provideLiquidity_WETH_BDEUR(
  amountWeth: number, 
  amountBdEur: number,
  user: SignerWithAddress)
{
  // todo ag mock function, should be replaced in the future
  // extracts collateral form user's account
  // assings bdeur to the user
  await bdStablePool.connect(user).mintBdStable(toErc20(amountBdEur));

  // mint WETH fromETH
  await weth.connect(user).deposit({ value: toErc20(amountWeth) });
  
  // add liquidity to the uniswap pool (weth-bdeur)
  // reveive LP tokens
  await weth.connect(user).approve(uniswapV2Router02.address, toErc20(amountWeth));
  await bdEur.connect(user).approve(uniswapV2Router02.address, toErc20(amountBdEur));
  
  const currentBlock = await hre.ethers.provider.getBlock("latest");

  // router routes to the proper pair
  await uniswapV2Router02.connect(user).addLiquidity(
    weth.address, 
    bdEur.address, 
    toErc20(amountWeth), 
    toErc20(amountBdEur), 
    toErc20(amountWeth), 
    toErc20(amountBdEur), 
    user.address, 
    currentBlock.timestamp + 60);

  // approve LP tokens transfer to the liquidity rewards manager
  await lpToken_BdEur_WETH.connect(user).approve(stakingRewards_BDEUR_WETH.address, toErc20(100));
}

async function simulateTimeElapseInDays(days: number){
  const minutesInDay = 60*24;
  const secondsInDay = minutesInDay*60;
  await timeTraveler.increaseTime(days*secondsInDay);
}

async function simulateTimeElapseInSeconds(seconds: number){
  await timeTraveler.increaseTime(seconds);
}

describe("StakingRewards", () => {
  describe("Normal staking", () => {
    before(async () => {
      await hre.deployments.fixture();
    });

    const depositedLPTokenUser1 = 2;
    const depositedLPTokenUser2 = 6;

    const totalDepositedLpTokens =
      +depositedLPTokenUser1 
      +depositedLPTokenUser2;

    it("should get first reward", async () => {  
      await provideLiquidity_WETH_BDEUR(1, 5, testUser1);
      await provideLiquidity_WETH_BDEUR(4, 20, testUser2);
  
      await stakingRewards_BDEUR_WETH.connect(testUser1).stake(toErc20(depositedLPTokenUser1));
      await stakingRewards_BDEUR_WETH.connect(testUser2).stake(toErc20(depositedLPTokenUser2));
  
      const days = 360;
      await simulateTimeElapseInDays(days)
  
      // await stakingRewards_BDEUR_WETH.connect(testUser1).withdraw(toErc20(depositedLPTokenUser1));
      await (await stakingRewards_BDEUR_WETH.connect(testUser1).getReward()).wait();
  
      const secondsSinceLastReward = days*24*60*60;
      const expectedReward = bdxPerSecondFirstYear.mul(secondsSinceLastReward).mul(depositedLPTokenUser1).div(totalDepositedLpTokens);
      const bdxReward = await bdx.balanceOf(testUser1.address);
      
      const diff = bdxReward.sub(expectedReward);

      console.log("Expected: "+ expectedReward);
      console.log("Actual:   "+ bdxReward);
      console.log("Diff:     "+ erc20ToNumber(diff));

      expect(diff).to.lt(toErc20(1));
    });

    it("should reward at least 99% of rewards supply", async () => {

      // we need to recalculate rewards every now and than
      for(let i = 1; i <= 5; i++){
        await simulateTimeElapseInDays(365);
        await (await stakingRewards_BDEUR_WETH.connect(ownerUser).renewIfApplicable()).wait();
      }

      await (await stakingRewards_BDEUR_WETH.connect(testUser1).getReward()).wait();
      await (await stakingRewards_BDEUR_WETH.connect(testUser2).getReward()).wait();

      const bdxRewardUser1 = await bdx.balanceOf(testUser1.address);
      const bdxRewardUser2 = await bdx.balanceOf(testUser2.address);

      const totalRewards = bdxRewardUser1.add(bdxRewardUser2);
      const unrewarded = rewardsSupply.sub(totalRewards);
      const unrewardedPct = unrewarded.mul(1e6).div(rewardsSupply).toNumber() / 1e6 * 100;

      console.log("Unrewarded %: "+ unrewardedPct +"%");

      expect(unrewardedPct).to.gte(0);
      expect(unrewardedPct).to.lt(1);
    });

    it("should be able to withdraw LP tokens", async () => {
      await (await stakingRewards_BDEUR_WETH.connect(testUser1).withdraw(toErc20(depositedLPTokenUser1))).wait();
      await (await stakingRewards_BDEUR_WETH.connect(testUser2).withdraw(toErc20(depositedLPTokenUser2))).wait();
    });

    it("should not be able to withdraw LP tokens when balance is empty", async () => {
      await expect(async () => {
        await (await stakingRewards_BDEUR_WETH.connect(testUser1).withdraw(1)).wait()
      }).to.throw();

      await expect(async () => {
        await (await stakingRewards_BDEUR_WETH.connect(testUser2).withdraw(1)).wait()
      }).to.throw();
    });
  })
  
  describe("Locked staking", () => {
    before(async () => {
      await hre.deployments.fixture();
    });
    
    const depositedLPTokenUser1 = 2;
    const depositedLPTokenUser2 = 6;

    it("should get reward", async () => {
      const user1YearsLocked = 5;
      const user1LockBonusMultiplier = 10;

      await provideLiquidity_WETH_BDEUR(1, 5, testUser1);
      await provideLiquidity_WETH_BDEUR(4, 20, testUser2);

      await stakingRewards_BDEUR_WETH.connect(testUser1).stakeLocked(toErc20(depositedLPTokenUser1), user1YearsLocked);
      await stakingRewards_BDEUR_WETH.connect(testUser2).stake(toErc20(depositedLPTokenUser2));

      const days = 360;
      await simulateTimeElapseInDays(days)

      await (await stakingRewards_BDEUR_WETH.connect(testUser1).getReward()).wait();

      const secondsSinceLastReward = days*24*60*60;
      const expectedReward = bdxPerSecondFirstYear
        .mul(secondsSinceLastReward)
        .mul(depositedLPTokenUser1*user1LockBonusMultiplier)
        .div(depositedLPTokenUser1*user1LockBonusMultiplier + depositedLPTokenUser2);
      const bdxReward = await bdx.balanceOf(testUser1.address);
      
      const diff = bdxReward.sub(expectedReward);

      console.log("Expected: "+ expectedReward);
      console.log("Actual:   "+ bdxReward);
      console.log("Diff:     "+ erc20ToNumber(diff));

      expect(diff).to.gte(0);
      expect(diff).to.lt(toErc20(1));
    });

    it("should reward at least 99% of rewards supply", async () => {

      // we need to recalculate rewards every now and than
      for(let i = 1; i <= 5; i++){
        await simulateTimeElapseInDays(365);
        await (await stakingRewards_BDEUR_WETH.connect(ownerUser).renewIfApplicable()).wait();
      }

      await (await stakingRewards_BDEUR_WETH.connect(testUser1).getReward()).wait();
      await (await stakingRewards_BDEUR_WETH.connect(testUser2).getReward()).wait();

      const bdxRewardUser1 = await bdx.balanceOf(testUser1.address);
      const bdxRewardUser2 = await bdx.balanceOf(testUser2.address);

      const totalRewards = bdxRewardUser1.add(bdxRewardUser2);
      const unrewarded = rewardsSupply.sub(totalRewards);
      const unrewardedPct = unrewarded.mul(1e6).div(rewardsSupply).toNumber() / 1e6 * 100;

      console.log("Total rewards user1: "+ bdxRewardUser1);
      console.log("Total rewards user2: "+ bdxRewardUser2);
      console.log("Unrewarded %: "+ unrewardedPct +"%");

      expect(unrewardedPct).to.gte(0);
      expect(unrewardedPct).to.lt(1);
    });

    it("should not be able to withdraw locked LP tokens", async () => {
      await expect(async () => {
        await (await stakingRewards_BDEUR_WETH.connect(testUser1).withdraw(1)).wait()
      }).to.throw();
    });

    it("should be able to withdraw LP tokens", async () => {
      const kekId = "???"; // todo ad how to get it?
      await (await stakingRewards_BDEUR_WETH.connect(testUser1).withdrawLocked(kekId)).wait();
      await (await stakingRewards_BDEUR_WETH.connect(testUser2).withdraw(toErc20(depositedLPTokenUser2))).wait();
    });

    it("should not be able to withdraw LP tokens when balance is empty", async () => {
      await expect(async () => {
        await (await stakingRewards_BDEUR_WETH.connect(testUser1).withdraw(1)).wait()
      }).to.throw();

      await expect(async () => {
        await (await stakingRewards_BDEUR_WETH.connect(testUser2).withdraw(1)).wait()
      }).to.throw();
    });
  })
});