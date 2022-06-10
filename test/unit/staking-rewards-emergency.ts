import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { getDeployer, getTreasurySigner, getUser1, getUser2 } from "../../utils/DeployedContractsHelpers";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";
import { expectEventWithArgs, expectToFail } from "../helpers/common";
import { DummyERC20, StakingRewards } from "../../typechain";
import {
  deployDummyBdStable,
  deployDummyBdx,
  deployDummyErc20,
  deployDummyStakingRewards,
  deployDummyStakingRewardsDistribution,
  deployDummyVesting
} from "./helpers";
import { to_d18 } from "../../utils/NumbersHelpers";
import { simulateTimeElapseInDays } from "../../utils/HelpersHardhat";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe.only("Staking rewards emergency", () => {
  let randomUser: SignerWithAddress;
  let emergencyExecutor: SignerWithAddress;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;

  let stakingToken: DummyERC20;
  let stakingRewards: StakingRewards;

  async function deploy() {
    const bdx = await deployDummyBdx(hre, owner);
    const bdStable = await deployDummyBdStable(hre, owner, treasury, bdx.address);
    const vesting = await deployDummyVesting(hre, owner, bdStable.address);
    stakingToken = await deployDummyErc20(hre);
    const stakingRewardsDistribution = await deployDummyStakingRewardsDistribution(hre, owner, treasury, bdx.address, vesting.address);

    stakingRewards = await deployDummyStakingRewards(hre, owner, stakingToken.address, stakingRewardsDistribution.address);

    await stakingRewards.setEmergencyExecutor(emergencyExecutor.address);

    await stakingRewardsDistribution.registerPools([stakingRewards.address], [1000]);
  }

  before(async () => {
    randomUser = await getUser1(hre);
    emergencyExecutor = await getUser2(hre);
    owner = await getDeployer(hre);
    treasury = await getTreasurySigner(hre);

    await deploy();
  });

  it("Setting emergency executor", async () => {
    await expectToFail(() => stakingRewards.connect(randomUser).setEmergencyExecutor(randomUser.address), "Ownable: caller is not the owner");
  });

  it("Toggling paused", async () => {
    await expectToFail(() => stakingRewards.connect(randomUser).pause(), "StakingRewards: You are not the owner or an emergency executor");

    const tx1 = await stakingRewards.connect(owner).pause();
    expectEventWithArgs(await tx1.wait(), "Paused", [owner.address]);
    expect(await stakingRewards.paused()).to.eq(true);

    const tx2 = await stakingRewards.connect(emergencyExecutor).unpause();
    expectEventWithArgs(await tx2.wait(), "Unpaused", [emergencyExecutor.address]);
    expect(await stakingRewards.paused()).to.eq(false);
  });

  it("Collect all rewards only when not paused", async () => {
    await stakingToken.connect(owner).mint(randomUser.address, to_d18(20));
    await stakingToken.connect(randomUser).approve(stakingRewards.address, to_d18(20));

    await stakingRewards.connect(randomUser).stake(to_d18(10));
    await stakingRewards.connect(randomUser).stakeLocked(to_d18(10), 1);

    const isPausedBefore = await stakingRewards.paused();
    if (!isPausedBefore) {
      await stakingRewards.connect(emergencyExecutor).pause();
    }

    await simulateTimeElapseInDays(366); // wait for locked stake to unlock

    const lockedStakes = await stakingRewards.lockedStakesOf(randomUser.address);
    const onlyStake = lockedStakes[0];

    await expectToFail(() => stakingRewards.connect(randomUser).withdraw(10), "Pausable: paused");
    await expectToFail(() => stakingRewards.connect(randomUser).withdrawLocked(onlyStake.kek_id, 0, 1), "Pausable: paused");

    await stakingRewards.connect(emergencyExecutor).unpause();

    await stakingRewards.connect(randomUser).withdraw(10);
    await stakingRewards.connect(randomUser).withdrawLocked(onlyStake.kek_id, 0, 1);
  });
});
