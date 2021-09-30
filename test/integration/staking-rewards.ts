import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { BDStable } from "../../typechain/BDStable";
import { StakingRewards } from "../../typechain/StakingRewards";
import { ERC20 } from "../../typechain/ERC20";
import { BDXShares } from '../../typechain/BDXShares';
import cap from "chai-as-promised";
import { to_d18, d18_ToNumber } from '../../utils/Helpers';
import { getDeployer, getUniswapPair, getWeth } from "../helpers/common"
import { simulateTimeElapseInDays } from "../../utils/HelpersHardhat"
import { BigNumber, Contract } from 'ethers';
import { provideLiquidity } from "../helpers/swaps"
import { StakingRewardsDistribution } from "../../typechain/StakingRewardsDistribution";
import { setUpFunctionalSystem, updateOracle } from "../helpers/SystemSetup";
import { Vesting } from "../../typechain/Vesting";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

const bdxFirstYearSchedule_d18 = to_d18(21000000).mul(20).div(100);
const bdxPerSecondFirstYear_d18 = bdxFirstYearSchedule_d18.div(365 * 24 * 60 * 60);
const totalRewardsSupply_d18 = to_d18(21e6 / 2);

let ownerUser: SignerWithAddress;
let testUser1: SignerWithAddress;
let testUser2: SignerWithAddress;

let weth: ERC20;
let bdEu: BDStable;
let bdx: BDXShares;
let stakingRewards_BDEU_WETH: StakingRewards;
let stakingRewardsDistribution: StakingRewardsDistribution;
let vesting: Vesting;

async function initialize() {
  ownerUser = await getDeployer(hre);
  testUser1 = await hre.ethers.getNamedSigner('TEST1');
  testUser2 = await hre.ethers.getNamedSigner('TEST2');
  weth = await getWeth(hre);
  bdEu = await hre.ethers.getContract('BDEU', ownerUser) as BDStable;
  bdx = await hre.ethers.getContract('BDXShares', ownerUser) as BDXShares;
  stakingRewards_BDEU_WETH = await hre.ethers.getContract('StakingRewards_BDEU_WETH', ownerUser) as StakingRewards;
  stakingRewardsDistribution = await hre.ethers.getContract("StakingRewardsDistribution", ownerUser) as StakingRewardsDistribution;
  vesting = await hre.ethers.getContract("Vesting" ,ownerUser) as Vesting;
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
  before(function () {
    return initialize();
  })


  beforeEach(async () => {
    await setVestingRewardsRatio(stakingRewardsDistribution, 0);
  })

  describe("Normal staking", () => {
    before(async () => {
      await hre.deployments.fixture();
      await setUpFunctionalSystem(hre);
    });


    let depositedLPTokenUser1_d18_global: BigNumber;
    let depositedLPTokenUser2_d18_global: BigNumber;

    it("should get first reward", async () => {
      // provide some initaila weth for the users
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
        await stakingRewards_BDEU_WETH.connect(ownerUser).renewIfApplicable();
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
      await setUpFunctionalSystem(hre);
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
        await stakingRewards_BDEU_WETH.connect(ownerUser).renewIfApplicable();
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

      await stakingRewards_BDEU_WETH.connect(testUser1).withdrawLocked(kekId);
    });

    it("should not be able to withdraw LP tokens after all locked stakes have been withdrawn", async () => {
      const lockedStakes = await stakingRewards_BDEU_WETH.lockedStakesOf(testUser1.address)

      expect(lockedStakes[0].kek_id).to.eq(BigNumber.from(0)); // deletion only fills whole object with 0s

      await expect((async () => {
        await stakingRewards_BDEU_WETH.connect(testUser1).withdraw(1);
      })()).to.be.rejectedWith("subtraction overflow");
    });
  });
});

describe('getReward interaction with vesting contract', () => {

  beforeEach(async () => {
    await initialize();
    await hre.deployments.fixture();
    await setUpFunctionalSystem(hre);
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

    const vestedAmount = userVestingSchedules.totalVestedAmount_d18 as BigNumber;

    const precision = 0.1;
    expect(d18_ToNumber(bdxReward_d18), 'Incorrect reward').to.be.closeTo(d18_ToNumber(rewardAvailable_d18), precision);
    expect(d18_ToNumber(vestedAmount), 'Incorrect vested amount').to.be.closeTo(d18_ToNumber(rewardToBeScheduledForVesting_d18), precision);
  })
});

async function getUsersCurrentLpBalance() {
  const pair = await getUniswapPair(hre, bdEu, weth);
  const depositedLPTokenUser1_d18 = await pair.balanceOf(testUser1.address);
  const depositedLPTokenUser2_d18 = await pair.balanceOf(testUser2.address);
  const totalDepositedLpTokens_d18 = depositedLPTokenUser1_d18.add(depositedLPTokenUser2_d18);

  return { totalDepositedLpTokens_d18, depositedLPTokenUser1_d18, depositedLPTokenUser2_d18 };
}