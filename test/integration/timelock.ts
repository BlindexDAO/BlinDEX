import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import { Timelock } from "../../typechain/Timelock";
import { getDeployer, getStakingRewardsDistribution } from "../../utils/DeployedContractsHelpers";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

const day = 60 * 60 * 24;

async function GetTimelock(): Promise<Timelock> {
  const deployer = await getDeployer(hre);
  const timelock = (await hre.ethers.getContract("Timelock", deployer)) as Timelock;
  return timelock;
}

async function ExecuteTranasactionWithTimelock(executionEta: number, elapseTime: number) {
  const timelock = await GetTimelock();

  const now = (await hre.ethers.provider.getBlock("latest")).timestamp;

  const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
  await timelock.queueTransaction(
    stakingRewardsDistribution.address,
    0,
    "",
    stakingRewardsDistribution.interface.encodeFunctionData("setVestingRewardRatio", [13]),
    now + executionEta
  );

  simulateTimeElapseInSeconds(elapseTime);

  await timelock.executeTransaction(
    stakingRewardsDistribution.address,
    0,
    "",
    stakingRewardsDistribution.interface.encodeFunctionData("setVestingRewardRatio", [13]),
    now + executionEta
  );
}

describe("Execute with timelock", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();

    const timelock = await GetTimelock();
    const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
    stakingRewardsDistribution.transferOwnership(timelock.address);
  });

  it("transaction should be executed before eta, withing grace period", async () => {
    const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);

    const pctBefore = await stakingRewardsDistribution.vestingRewardRatio_percent();

    await ExecuteTranasactionWithTimelock(day * (15 + 1), day * (15 + 1 + 1));

    const pctAfter = await stakingRewardsDistribution.vestingRewardRatio_percent();

    expect(pctBefore).be.not.eq(13);
    expect(pctAfter).be.eq(13);
  });

  it("transaction fail if executed before eta", async () => {
    await expect(
      (async () => {
        await await ExecuteTranasactionWithTimelock(day * (15 + 1), day * 7);
      })()
    ).to.be.rejectedWith("Transaction hasn't surpassed time lock.");
  });

  it("transaction fail if executed after grace period", async () => {
    await expect(
      (async () => {
        await await ExecuteTranasactionWithTimelock(day * (15 + 1), day * 60);
      })()
    ).to.be.rejectedWith("Transaction is stale.");
  });

  it("transaction fail if cheduled before mininum eta", async () => {
    await expect(
      (async () => {
        await await ExecuteTranasactionWithTimelock(day * 2, day * 10);
      })()
    ).to.be.rejectedWith("Estimated execution block must satisfy delay.");
  });
});
