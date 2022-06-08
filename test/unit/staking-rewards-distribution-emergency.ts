import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { getBdx, getDeployer, getTreasurySigner, getUser1, getUser2, getVesting } from "../../utils/DeployedContractsHelpers";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { expectEventWithArgs, expectToFail } from "../helpers/common";
import { StakingRewardsDistribution } from "../../typechain";
import { BigNumber } from "ethers";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Staking rewards distribution emergency", () => {
  let randomUser: SignerWithAddress;
  let emergencyExecutor: SignerWithAddress;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;

  let srd: StakingRewardsDistribution;

  async function deploy() {
    const vesting = await getVesting(hre); // todo ag deploy
    const bdx = await getBdx(hre); // todo ag deploy

    const srdFactory = await hre.ethers.getContractFactory("StakingRewardsDistribution");
    srd = (await srdFactory.connect(owner).deploy()) as StakingRewardsDistribution;
    await srd.deployed();
    await srd.initialize(bdx.address, vesting.address, treasury.address, BigNumber.from(100));

    await srd.setEmergencyExecutor(emergencyExecutor.address);
  }

  before(async () => {
    randomUser = await getUser1(hre);
    emergencyExecutor = await getUser2(hre);
    owner = await getDeployer(hre);
    treasury = await getTreasurySigner(hre);

    await deploy();
  });

  it("Setting emergency executor", async () => {
    await expectToFail(() => srd.connect(randomUser).setEmergencyExecutor(randomUser.address), "Ownable: caller is not the owner");
  });

  it("Toggling paused", async () => {
    await expectToFail(() => srd.connect(randomUser).toggleIsPaused(), "StakingRewardsDistribution: You are not the owner or an emergency executor");

    const isPausedBefore = await srd.isPaused();
    const tx1 = await srd.connect(owner).toggleIsPaused();
    expectEventWithArgs(await tx1.wait(), "IsPausedToggled", [!isPausedBefore]);
    expect(await srd.isPaused()).to.eq(!isPausedBefore);

    const isPausedAfter = await srd.isPaused();
    const tx2 = await srd.connect(emergencyExecutor).toggleIsPaused();
    expectEventWithArgs(await tx2.wait(), "IsPausedToggled", [!isPausedAfter]);
    expect(await srd.isPaused()).to.eq(!isPausedAfter);
  });

  it("Collect all rewards only when not paused", async () => {
    const isPausedBefore = await srd.isPaused();
    if (!isPausedBefore) {
      await srd.connect(emergencyExecutor).toggleIsPaused();
    }

    await expectToFail(() => srd.connect(randomUser).collectAllRewards(0, 10), "StakingRewardsDistribution: Contract is paused");
    await srd.connect(emergencyExecutor).toggleIsPaused();

    await srd.connect(randomUser).collectAllRewards(0, 10);
  });
});
