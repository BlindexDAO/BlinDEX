import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { BDStable } from "../../typechain/BDStable";
import { BDXShares } from '../../typechain/BDXShares';
import cap from "chai-as-promised";
import { to_d18, d18_ToNumber } from '../../utils/NumbersHelpers';
import { getBdEu, getBdx, getDeployer, getStakingRewardsDistribution, getUniswapPair, getVesting, getWeth } from "../../utils/DeployedContractsHelpers"
import { simulateTimeElapseInDays } from "../../utils/HelpersHardhat"
import { BigNumber } from 'ethers';
import { provideLiquidity } from "../helpers/swaps"
import { StakingRewardsDistribution } from "../../typechain/StakingRewardsDistribution";
import { setUpFunctionalSystem } from "../../utils/SystemSetup";
import { Vesting } from "../../typechain/Vesting";
import { WETH } from "../../typechain/WETH";
import { StakingRewards } from "../../typechain/StakingRewards";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

const bdxFirstYearSchedule_d18 = to_d18(21000000).mul(20).div(100);
const bdxPerSecondFirstYear_d18 = bdxFirstYearSchedule_d18.div(365 * 24 * 60 * 60);
const totalRewardsSupply_d18 = to_d18(21e6 / 2);

let deployer: SignerWithAddress;
let testUser1: SignerWithAddress;
let testUser2: SignerWithAddress;

let weth: WETH;
let bdEu: BDStable;
let bdx: BDXShares;
let stakingRewards_BDEU_WETH: StakingRewards;
let stakingRewardsDistribution: StakingRewardsDistribution;
let vesting: Vesting;

async function initialize() {
  deployer = await getDeployer(hre);
  testUser1 = await hre.ethers.getNamedSigner('TEST1');
  testUser2 = await hre.ethers.getNamedSigner('TEST2');
  weth = await getWeth(hre);
  bdEu = await getBdEu(hre);
  bdx = await getBdx(hre);
  stakingRewards_BDEU_WETH = await hre.ethers.getContract('StakingRewards_BDEU_WETH', deployer) as StakingRewards;
  stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
  vesting = await getVesting(hre);
}

async function get_BDEU_WETH_poolWeight() {
  const poolWeight = await stakingRewardsDistribution.stakingRewardsWeights(stakingRewards_BDEU_WETH.address);
  return poolWeight;
}

async function adjustRewardsFor_BDEU_WETH_pool(n: BigNumber) {
  const totalWeights = await stakingRewardsDistribution.stakingRewardsWeightsTotal();
  const poolWeight = await get_BDEU_WETH_poolWeight();

  return n.mul(poolWeight).div(totalWeights);
}

async function setVestingRewardsRatio(contract: StakingRewardsDistribution, ratio: number) {
  const deployer = await getDeployer(hre);
  await contract.connect(deployer).setVestingRewardRatio(ratio);
}

describe("StakingRewards", () => {
  beforeEach(async () => {
    await setVestingRewardsRatio(stakingRewardsDistribution, 0);
  })

  describe("Normal staking", () => {
    before(async () => {
      await hre.deployments.fixture();
      await setUpFunctionalSystem(hre, 1, true);
      await initialize();
    });

    let depositedLPTokenUser1_d18_global: BigNumber;
    let depositedLPTokenUser2_d18_global: BigNumber;

    it("should get first reward", async () => {
      // provide some initial weth for the users
      await weth.connect(testUser1).deposit({ value: to_d18(100) });
      await weth.connect(testUser2).deposit({ value: to_d18(100) });

      // deployer gives some bdeu to users so they can stake
      await bdEu.transfer(testUser1.address, to_d18(100));
      await bdEu.transfer(testUser2.address, to_d18(100));

      await provideLiquidity(hre, testUser1, weth, bdEu, to_d18(1), to_d18(5));
      await provideLiquidity(hre, testUser2, weth, bdEu, to_d18(4), to_d18(20));

      const { totalDepositedLpTokens_d18, depositedLPTokenUser1_d18, depositedLPTokenUser2_d18 } = await getUsersCurrentLpBalance();
      depositedLPTokenUser1_d18_global = depositedLPTokenUser1_d18;
      depositedLPTokenUser2_d18_global = depositedLPTokenUser2_d18;

      const pair = await getUniswapPair(hre, bdEu, weth);

      await pair.connect(testUser1).approve(stakingRewards_BDEU_WETH.address, depositedLPTokenUser1_d18);
      await pair.connect(testUser2).approve(stakingRewards_BDEU_WETH.address, depositedLPTokenUser2_d18);

      await stakingRewards_BDEU_WETH.connect(testUser1).stake(depositedLPTokenUser1_d18);
      await stakingRewards_BDEU_WETH.connect(testUser2).stake(depositedLPTokenUser2_d18);

      const days = 360;
      await simulateTimeElapseInDays(days)

      await stakingRewards_BDEU_WETH.connect(testUser1).getReward();

      const secondsSinceLastReward = days * 24 * 60 * 60;

      const expectedReward_d18 = await adjustRewardsFor_BDEU_WETH_pool(
        bdxPerSecondFirstYear_d18
          .mul(secondsSinceLastReward)
          .mul(depositedLPTokenUser1_d18)
          .div(totalDepositedLpTokens_d18));

      const bdxReward_d18 = await bdx.balanceOf(testUser1.address);

      const diff = bdxReward_d18.sub(expectedReward_d18);

      console.log("Expected: " + expectedReward_d18);
      console.log("Actual:   " + bdxReward_d18);
      console.log("Diff:     " + d18_ToNumber(diff));

      expect(diff).to.gte(0);
      expect(diff).to.lt(to_d18(1));
    });

    it("should reward at least 99% of rewards supply", async () => {

      // we need to recalculate rewards every now and than
      for (let i = 1; i <= 5; i++) {
        await simulateTimeElapseInDays(365);
        await stakingRewards_BDEU_WETH.connect(deployer).renewIfApplicable();
      }

      await stakingRewards_BDEU_WETH.connect(testUser1).getReward();
      await stakingRewards_BDEU_WETH.connect(testUser2).getReward();

      const bdxRewardUser1 = await bdx.balanceOf(testUser1.address);
      const bdxRewardUser2 = await bdx.balanceOf(testUser2.address);

      const rewardsSupplyPerPool = await adjustRewardsFor_BDEU_WETH_pool(totalRewardsSupply_d18);

      const totalRewards = bdxRewardUser1.add(bdxRewardUser2);
      const unrewarded = rewardsSupplyPerPool.sub(totalRewards);
      const unrewardedPct = unrewarded.mul(1e6).div(rewardsSupplyPerPool).toNumber() / 1e6 * 100;

      console.log("Unrewarded %: " + unrewardedPct + "%");

      expect(unrewardedPct).to.gte(0);
      expect(unrewardedPct).to.lt(1);
    });

    it("should be able to withdraw LP tokens", async () => {

      expect(d18_ToNumber(depositedLPTokenUser1_d18_global)).to.be.gt(0);
      expect(d18_ToNumber(depositedLPTokenUser2_d18_global)).to.be.gt(0);

      await stakingRewards_BDEU_WETH.connect(testUser1).withdraw(depositedLPTokenUser1_d18_global);
      await stakingRewards_BDEU_WETH.connect(testUser2).withdraw(depositedLPTokenUser2_d18_global);
    });

    it("should not be able to withdraw LP tokens when balance is empty", async () => {
      await expect((async () => {
        await stakingRewards_BDEU_WETH.connect(testUser1).withdraw(1)
      })()).to.be.rejectedWith("subtraction overflow");

      await expect((async () => {
        await stakingRewards_BDEU_WETH.connect(testUser2).withdraw(1)
      })()).to.be.rejectedWith("subtraction overflow");
    });
  })

  describe("Locked staking", () => {
    before(async () => {
      await hre.deployments.fixture();
      await initialize();
      await setUpFunctionalSystem(hre, 1, true);
    });

    it("should get reward", async () => {
      const user1YearsLocked = 5;
      const user1LockBonusMultiplier = 10;

      // provide some initaila weth for the users
      await weth.connect(testUser1).deposit({ value: to_d18(100) });
      await weth.connect(testUser2).deposit({ value: to_d18(100) });

      // deployer gives some bdeu to users so they can stake
      await bdEu.transfer(testUser1.address, to_d18(100));
      await bdEu.transfer(testUser2.address, to_d18(100));

      await provideLiquidity(hre, testUser1, weth, bdEu, to_d18(1), to_d18(5));
      await provideLiquidity(hre, testUser2, weth, bdEu, to_d18(4), to_d18(20));

      const { totalDepositedLpTokens_d18, depositedLPTokenUser1_d18, depositedLPTokenUser2_d18 } = await getUsersCurrentLpBalance();

      const pair = await getUniswapPair(hre, bdEu, weth);

      await pair.connect(testUser1).approve(stakingRewards_BDEU_WETH.address, depositedLPTokenUser1_d18);
      await pair.connect(testUser2).approve(stakingRewards_BDEU_WETH.address, depositedLPTokenUser2_d18);

      await stakingRewards_BDEU_WETH.connect(testUser1).stakeLocked(depositedLPTokenUser1_d18, user1YearsLocked);
      await stakingRewards_BDEU_WETH.connect(testUser2).stake(depositedLPTokenUser2_d18);

      const days = 360;
      await simulateTimeElapseInDays(days)

      await stakingRewards_BDEU_WETH.connect(testUser1).getReward();

      const secondsSinceLastReward = days * 24 * 60 * 60;

      const expectedReward = await adjustRewardsFor_BDEU_WETH_pool(
        bdxPerSecondFirstYear_d18
          .mul(secondsSinceLastReward)
          .mul(depositedLPTokenUser1_d18.mul(user1LockBonusMultiplier))
          .div(depositedLPTokenUser1_d18.mul(user1LockBonusMultiplier).add(depositedLPTokenUser2_d18)));

      const bdxReward = await bdx.balanceOf(testUser1.address);

      const diff = bdxReward.sub(expectedReward).abs();

      console.log("Expected: " + expectedReward);
      console.log("Actual:   " + bdxReward);
      console.log("Diff:     " + d18_ToNumber(diff));

      expect(diff).to.gte(0);
      expect(diff).to.lt(to_d18(1));
    });

    it("should reward at least 99% of rewards supply", async () => {

      // we need to recalculate rewards every now and than
      for (let i = 1; i <= 5; i++) {
        await simulateTimeElapseInDays(365);
        await stakingRewards_BDEU_WETH.connect(deployer).renewIfApplicable();
      }

      await stakingRewards_BDEU_WETH.connect(testUser1).getReward();
      await stakingRewards_BDEU_WETH.connect(testUser2).getReward();

      const bdxRewardUser1 = await bdx.balanceOf(testUser1.address);
      const bdxRewardUser2 = await bdx.balanceOf(testUser2.address);

      const rewardsSupplyPerPool = await adjustRewardsFor_BDEU_WETH_pool(totalRewardsSupply_d18);

      const totalRewards = bdxRewardUser1.add(bdxRewardUser2);
      const unrewarded = rewardsSupplyPerPool.sub(totalRewards);
      const unrewardedPct = unrewarded.mul(1e6).div(rewardsSupplyPerPool).toNumber() / 1e6 * 100;

      console.log("Total rewards user1: " + bdxRewardUser1);
      console.log("Total rewards user2: " + bdxRewardUser2);
      console.log("Unrewarded %: " + unrewardedPct + "%");

      expect(unrewardedPct).to.gte(0);
      expect(unrewardedPct).to.lt(1);
    });

    it("should not be able to withdraw (normal withdraw) locked LP tokens", async () => {
      await expect((async () => {
        await stakingRewards_BDEU_WETH.connect(testUser1).withdraw(1);
      })()).to.be.rejectedWith("subtraction overflow");
    });

    it("should be able to withdraw (withdrawLocked) LP tokens", async () => {
      const lockedStakes = await stakingRewards_BDEU_WETH.lockedStakesOf(testUser1.address)
      const onlyStake = lockedStakes[0];

      const kekId = onlyStake.kek_id;

      await stakingRewards_BDEU_WETH.connect(testUser1).withdrawLocked(kekId, 0, 100000);
    });
  });
});

describe('Staking - withdrawLocked', () => {
  before(async () => {
    await hre.deployments.fixture();
    await setUpFunctionalSystem(hre, 1, true);
    await initialize();
  });

  it("should remove stakes when withdrawn", async () => {
    // provide some initaila weth for the users
    await weth.connect(testUser1).deposit({ value: to_d18(100) });

    // deployer gives some bdeu to users so they can stake
    await bdEu.transfer(testUser1.address, to_d18(100));

    await provideLiquidity(hre, testUser1, weth, bdEu, to_d18(1), to_d18(5));

    const { totalDepositedLpTokens_d18, depositedLPTokenUser1_d18, depositedLPTokenUser2_d18 } = await getUsersCurrentLpBalance();

    const pair = await getUniswapPair(hre, bdEu, weth);

    await pair.connect(testUser1).approve(stakingRewards_BDEU_WETH.address, depositedLPTokenUser1_d18);

    await stakingRewards_BDEU_WETH.connect(testUser1).stakeLocked(to_d18(0.001), 1);
    await stakingRewards_BDEU_WETH.connect(testUser1).stakeLocked(to_d18(0.002), 1);
    await stakingRewards_BDEU_WETH.connect(testUser1).stakeLocked(to_d18(0.003), 1);
    await stakingRewards_BDEU_WETH.connect(testUser1).stakeLocked(to_d18(0.004), 1);

    const lockedStakesBefore = await stakingRewards_BDEU_WETH.lockedStakesOf(testUser1.address);
    expect(lockedStakesBefore.length).to.eq(4);

    await simulateTimeElapseInDays(365);

    await stakingRewards_BDEU_WETH.connect(testUser1).withdrawLocked(lockedStakesBefore[1].kek_id, 0, 10); // removing 0.002 stake

    const lockedStakesAfter = await stakingRewards_BDEU_WETH.lockedStakesOf(testUser1.address);
    expect(lockedStakesAfter.length).to.eq(3);
    expect(lockedStakesAfter.map(s => d18_ToNumber(s.amount))).to.members([0.001, 0.004, 0.003]);
  })
});

describe('locking an unlocked stake', () => {
  before(async () => {
    await hre.deployments.fixture();
    await setUpFunctionalSystem(hre, 1, true);
    await initialize();
  });

  it('shuld lock an unlocked stake', async () => {
    // provide some initial weth for the users
    await weth.connect(testUser1).deposit({ value: to_d18(100) });

    // deployer gives some bdeu to the uses so they can stake
    await bdEu.transfer(testUser1.address, to_d18(100));

    await provideLiquidity(hre, testUser1, weth, bdEu, to_d18(1), to_d18(5));

    const { depositedLPTokenUser1_d18 } = await getUsersCurrentLpBalance();

    const pair = await getUniswapPair(hre, bdEu, weth);
    await pair.connect(testUser1).approve(stakingRewards_BDEU_WETH.address, depositedLPTokenUser1_d18);
    await stakingRewards_BDEU_WETH.connect(testUser1).stake(depositedLPTokenUser1_d18);

    const days = 30;
    await simulateTimeElapseInDays(days)

    // now user decides to lock 60% of their stake
    const lockedStake = depositedLPTokenUser1_d18.mul(60).div(100);
    const unlockedStake = depositedLPTokenUser1_d18.sub(lockedStake);

    // act
    await stakingRewards_BDEU_WETH.connect(testUser1).lockExistingStake(lockedStake, 5);

    //assert
    expect((await stakingRewards_BDEU_WETH.unlockedBalanceOf(testUser1.address))).to.be.eq(unlockedStake, "incalid unlocked stake");
    expect((await stakingRewards_BDEU_WETH.lockedBalanceOf(testUser1.address))).to.be.eq(lockedStake, "invalid locked stake");
    
    const userLockedStaks = await stakingRewards_BDEU_WETH.lockedStakesOf(testUser1.address);
    const latestStake = userLockedStaks[userLockedStaks.length-1]
    const latestStakeLockedValue = latestStake[2];
    expect(latestStakeLockedValue).to.be.eq(lockedStake, "invalid latest locked stake value");
  });
});

describe('getReward interaction with vesting contract', () => {

  beforeEach(async () => {
    await hre.deployments.fixture();
    await initialize();
    await setUpFunctionalSystem(hre, 1, true);
  })

  it('should transfer only fraction of total rewards', async () => {
    // provide some initaila weth for the users
    await weth.connect(testUser1).deposit({ value: to_d18(100) });

    // deployer gives some bdeu to users so they can stake
    await bdEu.transfer(testUser1.address, to_d18(100));

    await provideLiquidity(hre, testUser1, weth, bdEu, to_d18(1), to_d18(5));

    const { totalDepositedLpTokens_d18, depositedLPTokenUser1_d18 } = await getUsersCurrentLpBalance();

    const pair = await getUniswapPair(hre, bdEu, weth);

    await pair.connect(testUser1).approve(stakingRewards_BDEU_WETH.address, depositedLPTokenUser1_d18);

    await stakingRewards_BDEU_WETH.connect(testUser1).stake(depositedLPTokenUser1_d18);

    const days = 360;
    await simulateTimeElapseInDays(days)

    await stakingRewards_BDEU_WETH.connect(testUser1).getReward();

    const secondsSinceLastReward = days * 24 * 60 * 60;

    const vestingRewardsRatio = await stakingRewardsDistribution.vestingRewardRatio_percent();

    const expectedReward_d18 = (await adjustRewardsFor_BDEU_WETH_pool(
      bdxPerSecondFirstYear_d18
        .mul(secondsSinceLastReward)
        .mul(depositedLPTokenUser1_d18)
        .div(totalDepositedLpTokens_d18)));

    const rewardAvailable_d18 = expectedReward_d18.mul(BigNumber.from(100).sub(vestingRewardsRatio)).div(100);
    const rewardToBeScheduledForVesting_d18 = expectedReward_d18.sub(rewardAvailable_d18);

    const bdxReward_d18 = await bdx.balanceOf(testUser1.address);

    const userVestingSchedules = await vesting.vestingSchedules(testUser1.address, 0);

    console.log("vesting scheduler: " + (await vesting.vestingScheduler()));
    const deployer = await getDeployer(hre);
    console.log("deployer: " + deployer.address);
    console.log("deplostakingRewardsDistributionyer: " + stakingRewardsDistribution.address);
    console.log("stakingRewards_BDEU_WETH: " + stakingRewards_BDEU_WETH.address);

    const vestedAmount = userVestingSchedules.totalVestedAmount_d18 as BigNumber;

    const precision = 0.1;
    expect(d18_ToNumber(bdxReward_d18), 'Incorrect reward').to.be.closeTo(d18_ToNumber(rewardAvailable_d18), precision);
    expect(d18_ToNumber(vestedAmount), 'Incorrect vested amount').to.be.closeTo(d18_ToNumber(rewardToBeScheduledForVesting_d18), precision);
  })
});

describe('Unregistering pools', () => {

  beforeEach(async () => {
    await hre.deployments.fixture();
    await initialize();
    await setUpFunctionalSystem(hre, 1, true);
  })

  it('should unregister pool', async () => {
    const srd = await getStakingRewardsDistribution(hre);

    const pools = await Promise.all([...Array(5).keys()].map(async i => await srd.stakingRewardsAddresses(i)));
    const pool2 = pools[2];
    const pool4 = pools[4];
    const pool2Weight = await srd.stakingRewardsWeights(pool2);

    expect(pool2Weight).to.be.gt(0); // test validation

    const totalWeightsBefore = await srd.stakingRewardsWeightsTotal();

    await srd.unregisterPool(pool2, 0, 100);

    const totalWeightsAfter = await srd.stakingRewardsWeightsTotal();

    expect(totalWeightsAfter).to.eq(totalWeightsBefore.sub(pool2Weight));
    expect(await srd.stakingRewardsAddresses(2)).to.eq(pool4); // the last pool (4) replaced the pool no 2 (the one unregistered)
  })
});

async function getUsersCurrentLpBalance() {
  const pair = await getUniswapPair(hre, bdEu, weth);
  const depositedLPTokenUser1_d18 = await pair.balanceOf(testUser1.address);
  const depositedLPTokenUser2_d18 = await pair.balanceOf(testUser2.address);
  const totalDepositedLpTokens_d18 = depositedLPTokenUser1_d18.add(depositedLPTokenUser2_d18);

  return { totalDepositedLpTokens_d18, depositedLPTokenUser1_d18, depositedLPTokenUser2_d18 };
}