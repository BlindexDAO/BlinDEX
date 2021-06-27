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
import { BDXShares } from '../../typechain/BDXShares';
import cap from "chai-as-promised";
import { simulateTimeElapseInDays, to_d18, d18_ToNumber } from "../../utils/Helpers"
import { BigNumber } from "ethers";
import * as constants from '../../utils/Constants';
import { provideLiquidity_WETH_BDEUR } from "../helpers/swaps"
import { StakingRewardsDistribution } from "../../typechain/StakingRewardsDistribution";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

const bdxFirstYearSchedule = to_d18(21000000).mul(20).div(100);
const bdxPerSecondFirstYear = bdxFirstYearSchedule.div(365*24*60*60);
const totalRewardsSupply = to_d18(21e6/2);

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
let stakingRewardsDistribution: StakingRewardsDistribution;  

let swapPairAddress: string;
let lpToken_BdEur_WETH: ERC20;

async function initialize(){
  ownerUser = await hre.ethers.getNamedSigner('POOL_CREATOR');
  testUser1 = await hre.ethers.getNamedSigner('TEST1');
  testUser2 = await hre.ethers.getNamedSigner('TEST2');
  weth = await hre.ethers.getContractAt("WETH", constants.wETH_address[hre.network.name], ownerUser) as unknown as WETH;
  bdStablePool = await hre.ethers.getContract('BDEUR_WETH_POOL', ownerUser) as unknown as BdStablePool;
  bdEur = await hre.ethers.getContract('BDEUR', ownerUser) as unknown as BDStable;
  bdx = await hre.ethers.getContract('BDXShares', ownerUser) as unknown as BDXShares;
  uniswapV2Router02 = await hre.ethers.getContract('UniswapV2Router02', ownerUser) as unknown as UniswapV2Router02;
  stakingRewards_BDEUR_WETH = await hre.ethers.getContract('StakingRewards_BDEUR_WETH', ownerUser) as unknown as StakingRewards;
  uniswapFactory = await hre.ethers.getContract("UniswapV2Factory", ownerUser) as unknown as UniswapV2Factory;
  stakingRewardsDistribution = await hre.ethers.getContract("StakingRewardsDistribution", ownerUser) as unknown as StakingRewardsDistribution;

  swapPairAddress = await uniswapFactory.getPair(bdEur.address, weth.address);
  lpToken_BdEur_WETH = await hre.ethers.getContractAt("ERC20", swapPairAddress, ownerUser) as unknown as ERC20;
}

async function get_BDEUR_WETH_poolWeight(){
  const poolWeight = await stakingRewardsDistribution.stakingRewardsWeights(stakingRewards_BDEUR_WETH.address);
  return poolWeight;
}

async function adjustRewardsFor_BDEUR_WETH_pool(n: BigNumber){
  const totalWeights = await stakingRewardsDistribution.stakingRewardsWeightsTotal();
  const poolWeight = await get_BDEUR_WETH_poolWeight();

  return n.mul(poolWeight).div(totalWeights);
}

describe("StakingRewards", () => {
  before(function() {
    return initialize();
  })

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
      await provideLiquidity_WETH_BDEUR(hre, 1, 5, testUser1);
      await provideLiquidity_WETH_BDEUR(hre, 4, 20, testUser2);
  
      await stakingRewards_BDEUR_WETH.connect(testUser1).stake(to_d18(depositedLPTokenUser1));
      await stakingRewards_BDEUR_WETH.connect(testUser2).stake(to_d18(depositedLPTokenUser2));
  
      const days = 360;
      await simulateTimeElapseInDays(days)
  
      // await stakingRewards_BDEUR_WETH.connect(testUser1).withdraw(to_d_18(depositedLPTokenUser1));
      await (await stakingRewards_BDEUR_WETH.connect(testUser1).getReward()).wait();
  
      const secondsSinceLastReward = days*24*60*60;
      
      const expectedReward = await adjustRewardsFor_BDEUR_WETH_pool(
        bdxPerSecondFirstYear
        .mul(secondsSinceLastReward)
        .mul(depositedLPTokenUser1)
        .div(totalDepositedLpTokens));

      const bdxReward = await bdx.balanceOf(testUser1.address);
      
      const diff = bdxReward.sub(expectedReward);

      console.log("Expected: "+ expectedReward);
      console.log("Actual:   "+ bdxReward);
      console.log("Diff:     "+ d18_ToNumber(diff));

      expect(diff).to.gte(0);
      expect(diff).to.lt(to_d18(1));
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

      const rewardsSupplyPerPool = await adjustRewardsFor_BDEUR_WETH_pool(totalRewardsSupply);

      const totalRewards = bdxRewardUser1.add(bdxRewardUser2);
      const unrewarded = rewardsSupplyPerPool.sub(totalRewards);
      const unrewardedPct = unrewarded.mul(1e6).div(rewardsSupplyPerPool).toNumber() / 1e6 * 100;

      console.log("Unrewarded %: "+ unrewardedPct +"%");

      expect(unrewardedPct).to.gte(0);
      expect(unrewardedPct).to.lt(1);
    });

    it("should be able to withdraw LP tokens", async () => {
      await (await stakingRewards_BDEUR_WETH.connect(testUser1).withdraw(to_d18(depositedLPTokenUser1))).wait();
      await (await stakingRewards_BDEUR_WETH.connect(testUser2).withdraw(to_d18(depositedLPTokenUser2))).wait();
    });

    it("should not be able to withdraw LP tokens when balance is empty", async () => {
      await expect((async () => {
        await (await stakingRewards_BDEUR_WETH.connect(testUser1).withdraw(1)).wait()
      })()).to.be.rejectedWith("subtraction overflow");

      await expect((async () => {
        await (await stakingRewards_BDEUR_WETH.connect(testUser2).withdraw(1)).wait()
      })()).to.be.rejectedWith("subtraction overflow");
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

      await provideLiquidity_WETH_BDEUR(hre, 1, 5, testUser1);
      await provideLiquidity_WETH_BDEUR(hre, 4, 20, testUser2);

      await stakingRewards_BDEUR_WETH.connect(testUser1).stakeLocked(to_d18(depositedLPTokenUser1), user1YearsLocked);
      await stakingRewards_BDEUR_WETH.connect(testUser2).stake(to_d18(depositedLPTokenUser2));

      const days = 360;
      await simulateTimeElapseInDays(days)

      await (await stakingRewards_BDEUR_WETH.connect(testUser1).getReward()).wait();

      const secondsSinceLastReward = days*24*60*60;
      
      const expectedReward = await adjustRewardsFor_BDEUR_WETH_pool(
        bdxPerSecondFirstYear
        .mul(secondsSinceLastReward)
        .mul(depositedLPTokenUser1*user1LockBonusMultiplier)
        .div(depositedLPTokenUser1*user1LockBonusMultiplier + depositedLPTokenUser2));
      
      const bdxReward = await bdx.balanceOf(testUser1.address);
      
      const diff = bdxReward.sub(expectedReward).abs();

      console.log("Expected: "+ expectedReward);
      console.log("Actual:   "+ bdxReward);
      console.log("Diff:     "+ d18_ToNumber(diff));

      expect(diff).to.gte(0);
      expect(diff).to.lt(to_d18(1));
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

      const rewardsSupplyPerPool = await adjustRewardsFor_BDEUR_WETH_pool(totalRewardsSupply);
      
      const totalRewards = bdxRewardUser1.add(bdxRewardUser2);
      const unrewarded = rewardsSupplyPerPool.sub(totalRewards);
      const unrewardedPct = unrewarded.mul(1e6).div(rewardsSupplyPerPool).toNumber() / 1e6 * 100;

      console.log("Total rewards user1: "+ bdxRewardUser1);
      console.log("Total rewards user2: "+ bdxRewardUser2);
      console.log("Unrewarded %: "+ unrewardedPct +"%");

      expect(unrewardedPct).to.gte(0);
      expect(unrewardedPct).to.lt(1);
    });

    it("should not be able to withdraw (normal withdraw) locked LP tokens", async () => {
      await expect((async () => {
        await (await stakingRewards_BDEUR_WETH.connect(testUser1).withdraw(1)).wait()
      })()).to.be.rejectedWith("subtraction overflow");
    });

    it("should be able to withdraw (withdrawLocked) LP tokens", async () => {
      const lockedStakes = await stakingRewards_BDEUR_WETH.lockedStakesOf(testUser1.address)
      const onlyStake = lockedStakes[0];

      const kekId = onlyStake.kek_id;

      await (await stakingRewards_BDEUR_WETH.connect(testUser1).withdrawLocked(kekId)).wait();
    });

    it("should not be able to withdraw LP tokens after all locked stakes have been withdrawn", async () => {
      const lockedStakes = await stakingRewards_BDEUR_WETH.lockedStakesOf(testUser1.address)
      
      expect(lockedStakes[0].kek_id).to.eq(BigNumber.from(0)); // deletion only fills whole object with 0s

      await expect((async () => {
        await (await stakingRewards_BDEUR_WETH.connect(testUser1).withdraw(1)).wait()
      })()).to.be.rejectedWith("subtraction overflow");
    });
  });
});