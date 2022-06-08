import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { getDeployer, getUser1, getUser2 } from "../../utils/DeployedContractsHelpers";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { expectEventWithArgs, expectToFail } from "../helpers/common";
import { Vesting } from "../../typechain";
import { deployDummyErc20, deployDummyVesting } from "./helpers";
import { BigNumber } from "ethers";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Vesting emergency", () => {
  let randomUser: SignerWithAddress;
  let emergencyExecutor: SignerWithAddress;
  let owner: SignerWithAddress;

  let vesting: Vesting;

  async function deploy() {
    const dummyErc20 = await deployDummyErc20(hre);
    vesting = await deployDummyVesting(hre, owner, dummyErc20.address);

    await vesting.setEmergencyExecutor(emergencyExecutor.address);
  }

  before(async () => {
    randomUser = await getUser1(hre);
    emergencyExecutor = await getUser2(hre);
    owner = await getDeployer(hre);

    await deploy();
  });

  it("Setting emergency executor", async () => {
    await expectToFail(() => vesting.connect(randomUser).setEmergencyExecutor(randomUser.address), "Ownable: caller is not the owner");
  });

  it("Toggling paused", async () => {
    await expectToFail(() => vesting.connect(randomUser).toggleIsPaused(), "Vesting: You are not the owner or an emergency executor");

    const isPausedBefore = await vesting.isPaused();
    const tx1 = await vesting.connect(owner).toggleIsPaused();
    expectEventWithArgs(await tx1.wait(), "IsPausedToggled", [!isPausedBefore]);
    expect(await vesting.isPaused()).to.eq(!isPausedBefore);

    const isPausedAfter = await vesting.isPaused();
    const tx2 = await vesting.connect(emergencyExecutor).toggleIsPaused();
    expectEventWithArgs(await tx2.wait(), "IsPausedToggled", [!isPausedAfter]);
    expect(await vesting.isPaused()).to.eq(!isPausedAfter);
  });

  it("Claim only when not paused", async () => {
    const isPausedBefore = await vesting.isPaused();
    if (!isPausedBefore) {
      await vesting.connect(emergencyExecutor).toggleIsPaused();
    }

    await expectToFail(() => vesting.connect(randomUser).claim(0, 10), "Vesting: Contract is paused");
    await vesting.connect(emergencyExecutor).toggleIsPaused();

    const tx = await vesting.connect(randomUser).claim(0, 10);
    expectEventWithArgs(await tx.wait(), "RewardClaimed", [randomUser.address, BigNumber.from(0)]);
  });
});
