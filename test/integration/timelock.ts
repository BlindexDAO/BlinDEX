import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import type { Timelock } from "../../typechain/Timelock";
import { getDeployer, getExecutor, getProposer, getStakingRewardsDistribution, getUser3 } from "../../utils/DeployedContractsHelpers";
import { BigNumber } from "ethers";
import { expectToFail } from "../helpers/common";
import { extractTxParamsHashAndTxHashFromSingleTransaction } from "../../utils/TimelockHelpers";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

const day = 60 * 60 * 24;

async function GetTimelock(): Promise<Timelock> {
  const deployer = await getDeployer(hre);
  const timelock = (await hre.ethers.getContract("Timelock", deployer)) as Timelock;
  return timelock;
}

describe("Execute with timelock", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();

    const timelock = await GetTimelock();
    const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
    stakingRewardsDistribution.transferOwnership(timelock.address);
  });

  it("transaction should be executed after eta, within grace period", async () => {
    const delay = day * 15;
    const timeBetweenEtaAndExecution = day * 2;
    const expectedVestingRewardRatio = 13;

    const timelock = await GetTimelock();
    const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
    const proposer = await getProposer(hre);
    const executor = await getExecutor(hre);
    const randomUser = await getUser3(hre);

    expect((await stakingRewardsDistribution.vestingRewardRatio_percent()).toNumber()).to.not.eq(expectedVestingRewardRatio);

    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;

    const queuedTransactions = [
      {
        recipient: stakingRewardsDistribution.address,
        value: 0,
        data: (await stakingRewardsDistribution.populateTransaction.setVestingRewardRatio(13)).data as string
      }
    ];

    const etaBN = BigNumber.from(now).add(delay + 100);

    const receipt = await (await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, etaBN)).wait();
    const { txParamsHash } = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "QueuedTransactionsBatch");

    await expectToFail(
      () => timelock.connect(proposer).executeTransactionsBatch(queuedTransactions, etaBN),
      "Timelock: only the executor or owner can perform this action"
    );

    await expectToFail(
      () => timelock.connect(randomUser).executeTransactionsBatch(queuedTransactions, etaBN),
      "Timelock: only the executor or owner can perform this action"
    );

    await expectToFail(
      () => timelock.connect(executor).executeTransactionsBatch(queuedTransactions, etaBN),
      "Timelock: Transaction hasn't been approved."
    );
    await timelock.approveTransactionsBatch(txParamsHash);

    await expectToFail(
      () => timelock.connect(executor).executeTransactionsBatch(queuedTransactions, etaBN),
      "Timelock: Transaction hasn't surpassed the execution delay."
    );
    await simulateTimeElapseInSeconds(delay + timeBetweenEtaAndExecution);

    await expectToFail(
      () => timelock.connect(proposer).executeTransactionsBatch(queuedTransactions, etaBN),
      "Timelock: only the executor or owner can perform this action"
    );

    await expectToFail(
      () => timelock.connect(randomUser).executeTransactionsBatch(queuedTransactions, etaBN),
      "Timelock: only the executor or owner can perform this action"
    );

    await timelock.connect(executor).executeTransactionsBatch(queuedTransactions, etaBN);

    expect((await stakingRewardsDistribution.vestingRewardRatio_percent()).toNumber()).to.eq(expectedVestingRewardRatio);
  });
});
