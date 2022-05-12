import { Recorder } from "../../utils/Recorder/Recorder";
import { TimelockStrategy } from "../../utils/Recorder/strategies/TimelockStrategy";
import { RecordableContract } from "../../utils/Recorder/RecordableContract";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import { Flipper, Timelock } from "../../typechain";
import { expect } from "chai";
import hre from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import {
  decodeTimelockQueuedTransactions,
  extractTimelockQueuedTransactionsBatchParamsDataAndHash,
  extractTxParamsHashAndTxHashFromSingleTransaction,
  QueuedTransaction,
  TransactionStatus
} from "../../utils/TimelockHelpers";
import { expectEvent, expectEventWithArgs, expectToFail } from "../helpers/common";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { extractTheOnlyEvent } from "../../utils/ExtractingEvents";

chai.use(cap);
chai.use(solidity);

const DAY = 86400;
const EXECUTION_DELAY = 2 * DAY;
const MIN_DELAY = EXECUTION_DELAY;
const MAX_DELAY = 30 * DAY;
const MARGIN_SECONDS = 10;
const GRACE_PERIOD_SECONDS = 14 * DAY;

describe("Timelock", () => {
  let owner: SignerWithAddress;
  let proposer: SignerWithAddress;
  let executor: SignerWithAddress;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let flipper: Flipper;
  let timelock: Timelock;

  async function deploy() {
    [owner, proposer, executor, user, user2] = await hre.ethers.getSigners();
    const flipperFactory = await hre.ethers.getContractFactory("Flipper");
    flipper = (await flipperFactory.deploy()) as Flipper;
    await flipper.deployed();
    const timeLockFactory = await hre.ethers.getContractFactory("Timelock");
    timelock = (await timeLockFactory.deploy(proposer.address, executor.address, MIN_DELAY, MAX_DELAY, GRACE_PERIOD_SECONDS)) as Timelock;

    await timelock.deployed();
    await flipper.transferOwnership(timelock.address);
  }

  describe("Deployment", async () => {
    before("deploy contracts", async () => {
      await deploy();
    });

    it("Deployed correctly", async function () {
      const state0 = await flipper.state(0);
      const state1 = await flipper.state(1);
      const state2 = await flipper.state(2);
      const flipperOwner = await flipper.owner();
      const timelockProposer = await timelock.proposer();
      const timelockExecutor = await timelock.executor();
      const timelockOwner = await timelock.owner();

      expect(state0).to.equal(false);
      expect(state1).to.equal(false);
      expect(state2).to.equal(false);
      expect(flipperOwner).to.equal(timelock.address);
      expect(timelockOwner).to.equal(owner.address);
      expect(timelockProposer).to.equal(proposer.address);
      expect(timelockExecutor).to.equal(executor.address);
    });

    it("Flipping should fail when called not by proposer", async () => {
      await expect(flipper.flip(0)).to.be.reverted;
    });
  });

  describe("Setters", async () => {
    before("deploy contracts", async () => {
      await deploy();
    });

    let minimumExecutionDelay: number;

    it("Set execution minimum delay", async () => {
      minimumExecutionDelay = 1 * DAY;

      await expectToFail(
        () => timelock.connect(owner).setMinimumExecutionDelay(minimumExecutionDelay - 1),
        "Timelock: Minimum execution delay must be >= 1 day."
      );

      await expectToFail(() => timelock.connect(proposer).setMinimumExecutionDelay(minimumExecutionDelay), "Ownable: caller is not the owner");

      const receipt = await (await timelock.connect(owner).setMinimumExecutionDelay(minimumExecutionDelay)).wait();
      const event = extractTheOnlyEvent(receipt, "NewMinimumExecutionDelaySet");

      expect(event.args?.delay).to.eq(minimumExecutionDelay);
      expect(await timelock.minimumExecutionDelay()).to.eq(minimumExecutionDelay);
    });

    it("Set execution maximum delay", async () => {
      await expectToFail(
        () => timelock.connect(owner).setMaximumExecutionDelay(minimumExecutionDelay - 1),
        "Timelock: Maximum execution delay cannot be lesser than minimum execution delay."
      );

      await expectToFail(() => timelock.connect(proposer).setMaximumExecutionDelay(minimumExecutionDelay), "Ownable: caller is not the owner");

      await timelock.connect(owner).setMaximumExecutionDelay(minimumExecutionDelay);

      const maximumExecutionDelay = minimumExecutionDelay + 1;

      const receipt = await (await timelock.connect(owner).setMaximumExecutionDelay(maximumExecutionDelay)).wait();
      const event = extractTheOnlyEvent(receipt, "NewMaximumExecutionDelaySet");

      expect(event.args?.delay).to.eq(maximumExecutionDelay);
      expect(await timelock.maximumExecutionDelay()).to.eq(maximumExecutionDelay);
    });

    it("Set execution grace period", async () => {
      const gracePeriod = 2 * DAY;

      await expectToFail(() => timelock.connect(proposer).setExecutionGracePeriod(gracePeriod), "Ownable: caller is not the owner");

      const receipt = await (await timelock.connect(owner).setExecutionGracePeriod(gracePeriod)).wait();
      const event = extractTheOnlyEvent(receipt, "NewExecutionGracePeriodSet");

      expect(event.args?.gracePeriod).to.eq(gracePeriod);
      expect(await timelock.executionGracePeriod()).to.eq(gracePeriod);
    });

    it("Set proposer", async () => {
      await expectToFail(() => timelock.connect(user2).setProposer(user.address), "Ownable: caller is not the owner");
      await expectToFail(() => timelock.connect(owner).setProposer(hre.ethers.constants.AddressZero), "Timelock: Proposer address cannot be 0");

      const receipt = await (await timelock.connect(owner).setProposer(user.address)).wait();
      const event = extractTheOnlyEvent(receipt, "NewProposerSet");

      expect(event.args?.newProposer).to.eq(user.address);
      expect(await timelock.proposer()).to.eq(user.address);
    });

    it("Set executor", async () => {
      await expectToFail(() => timelock.connect(user2).setExecutor(user.address), "Ownable: caller is not the owner");
      await timelock.connect(owner).setExecutor(hre.ethers.constants.AddressZero); // should allow to disable executor

      const receipt = await (await timelock.connect(owner).setExecutor(user.address)).wait();
      const event = extractTheOnlyEvent(receipt, "NewExecutorSet");

      expect(event.args?.newExecutor).to.eq(user.address);
      expect(await timelock.executor()).to.eq(user.address);
    });
  });

  describe("Queueing transaction", async () => {
    let queuedTransactions: QueuedTransaction[] = [];

    before("deploy contracts", async () => {
      await deploy();
      queuedTransactions = [
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(0)).data as string
        },
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(1)).data as string
        }
      ];
    });

    it("Queueing transaction by owner with proper eta should not fail", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta);
    });

    it("Queueing transaction by user with proper eta should fail", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY));

      await expectToFail(
        () => timelock.connect(user).queueTransactionsBatch(queuedTransactions, eta),
        "Timelock: only the proposer can perform this action"
      );
    });

    it("Queueing transaction by proposer with eta before minimum delay should fail", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY - MARGIN_SECONDS));

      await expectToFail(
        () => timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta),
        "Timelock: Estimated execution time must satisfy delay."
      );
    });

    it("Queueing transaction by proposer with eta after max delay and grace period should fail", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY).add(BigNumber.from(MAX_DELAY).add(1)));

      await expectToFail(
        () => timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta),
        "Timelock: Estimated execution time must satisfy delay."
      );
    });

    it("Queueing transaction by proposer with proper eta should work", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      const tx: ContractTransaction = await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta);
      const receipt: ContractReceipt = await tx.wait();
      expectEvent(receipt, "QueuedTransactionsBatch");
      const dataFromReceipt = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "QueuedTransactionsBatch");

      expect(dataFromReceipt.txParamsHash).to.be.ok;
      expect(dataFromReceipt.txHash).to.be.ok;
      expect(await timelock.connect(proposer).queuedTransactions(dataFromReceipt.txParamsHash)).to.be.equal(TransactionStatus.Queued);
    });
  });

  describe("Approving transaction", async () => {
    let txParamsHash: string;
    let queuedTransactions: QueuedTransaction[] = [];

    before("deploy contracts", async () => {
      await deploy();
      queuedTransactions = [
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(0)).data as string
        },
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(1)).data as string
        }
      ];
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      const tx: ContractTransaction = await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta);
      const receipt: ContractReceipt = await tx.wait();
      ({ txParamsHash } = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "QueuedTransactionsBatch"));
    });

    it("Approving transaction by proposer should fail", async () => {
      await expectToFail(() => timelock.connect(proposer).approveTransactionsBatch(txParamsHash), "Ownable: caller is not the owner");
    });

    it("Approving transaction by user should fail", async () => {
      await expectToFail(() => timelock.connect(user).approveTransactionsBatch(txParamsHash), "Ownable: caller is not the owner");
    });

    it("Approving transaction by owner should work", async () => {
      const tx: ContractTransaction = await timelock.connect(owner).approveTransactionsBatch(txParamsHash);
      const receipt: ContractReceipt = await tx.wait();
      expectEventWithArgs(receipt, "ApprovedTransactionsBatch", [txParamsHash]);
      const dataFromReceipt = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "ApprovedTransactionsBatch");

      expect(dataFromReceipt.txParamsHash).to.be.ok;
      expect(dataFromReceipt.txHash).to.be.ok;
      expect(dataFromReceipt.txParamsHash).to.eq(txParamsHash);
      expect(await timelock.queuedTransactions(txParamsHash)).to.be.equal(TransactionStatus.Approved);
    });

    it("Approving not queued transaction by owner should fail ", async () => {
      await expectToFail(() => timelock.connect(owner).approveTransactionsBatch(txParamsHash), "Timelock: transaction is not queued");
    });
  });

  describe("Running as owner", async () => {
    let queuedTransactions: QueuedTransaction[] = [];

    beforeEach("deploy contracts", async () => {
      await deploy();

      queuedTransactions = [
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(0)).data as string
        }
      ];
    });

    it("Should execute as owner", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      const receipt = await (await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta)).wait();
      const { txParamsHash } = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "QueuedTransactionsBatch");

      const flipperBefore = await flipper.state(0);

      await timelock.connect(owner).approveTransactionsBatch(txParamsHash);

      await simulateTimeElapseInSeconds(EXECUTION_DELAY + MARGIN_SECONDS);

      expect(await timelock.queuedTransactions(txParamsHash)).to.eq(TransactionStatus.Approved);
      await timelock.connect(owner).executeTransactionsBatch(queuedTransactions, eta);
      expect(await timelock.queuedTransactions(txParamsHash)).to.eq(TransactionStatus.NonExistent);

      const flipperAfter = await flipper.state(0);
      expect(flipperBefore).to.not.eq(flipperAfter);
    });

    it("Should cancel as owner", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      const receipt = await (await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta)).wait();
      const { txParamsHash } = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "QueuedTransactionsBatch");

      const flipperBefore = await flipper.state(0);

      expect(await timelock.queuedTransactions(txParamsHash)).to.eq(TransactionStatus.Queued);
      await timelock.connect(owner).cancelTransactionsBatch(txParamsHash);
      expect(await timelock.queuedTransactions(txParamsHash)).to.eq(TransactionStatus.NonExistent);

      const flipperAfter = await flipper.state(0);
      expect(flipperBefore).to.eq(flipperAfter);
    });

    it("Should approve and execute at the same time as owner", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      const receipt = await (await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta)).wait();
      const { txParamsHash } = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "QueuedTransactionsBatch");

      await expectToFail(
        () => timelock.connect(owner).approveAndExecuteTransactionsBatch(queuedTransactions, eta),
        "Timelock: Transaction hasn't surpassed the execution delay."
      );

      await simulateTimeElapseInSeconds(EXECUTION_DELAY + MARGIN_SECONDS);

      const flipperBefore = await flipper.state(0);

      expect(await timelock.queuedTransactions(txParamsHash)).to.eq(TransactionStatus.Queued);
      await timelock.connect(owner).approveAndExecuteTransactionsBatch(queuedTransactions, eta);
      expect(await timelock.queuedTransactions(txParamsHash)).to.eq(TransactionStatus.NonExistent);

      const flipperAfter = await flipper.state(0);
      expect(flipperBefore).to.not.eq(flipperAfter);
    });

    it("Should approve and execute raw tx data at the same time as owner", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      const receipt = await (await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta)).wait();
      const { txParamsHash, txHash } = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "QueuedTransactionsBatch");

      await simulateTimeElapseInSeconds(EXECUTION_DELAY + MARGIN_SECONDS);

      const flipperBefore = await flipper.state(0);
      expect(await timelock.queuedTransactions(txParamsHash)).to.eq(TransactionStatus.Queued);

      const x = await extractTimelockQueuedTransactionsBatchParamsDataAndHash(hre, txHash);
      await timelock.connect(owner).approveAndExecuteTransactionsBatchRaw(x.txParamsData);
      expect(await timelock.queuedTransactions(txParamsHash)).to.eq(TransactionStatus.NonExistent);

      const flipperAfter = await flipper.state(0);
      expect(flipperBefore).to.not.eq(flipperAfter);
    });

    it("Should not approve and execute at the same time as proposer", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      await expectToFail(
        () => timelock.connect(proposer).approveAndExecuteTransactionsBatch(queuedTransactions, eta),
        "Ownable: caller is not the owner"
      );
    });

    it("Should not approve and execute at the same time as user", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      await expectToFail(
        () => timelock.connect(user).approveAndExecuteTransactionsBatch(queuedTransactions, eta),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Executing as executor", async () => {
    let queuedTransactions: QueuedTransaction[] = [];

    beforeEach("deploy contracts", async () => {
      await deploy();

      queuedTransactions = [
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(0)).data as string
        }
      ];
    });

    it("Should execute as executor", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      const receipt = await (await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta)).wait();
      const { txParamsHash } = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "QueuedTransactionsBatch");

      const flipperBefore = await flipper.state(0);

      await timelock.connect(owner).approveTransactionsBatch(txParamsHash);

      await simulateTimeElapseInSeconds(EXECUTION_DELAY + MARGIN_SECONDS);

      expect(await timelock.queuedTransactions(txParamsHash)).to.eq(TransactionStatus.Approved);

      expectToFail(
        () => timelock.connect(user).executeTransactionsBatch(queuedTransactions, eta),
        "Timelock: only the executor or owner can perform this action"
      );
      expectToFail(
        () => timelock.connect(proposer).executeTransactionsBatch(queuedTransactions, eta),
        "Timelock: only the executor or owner can perform this action"
      );

      await timelock.connect(executor).executeTransactionsBatch(queuedTransactions, eta);
      expect(await timelock.queuedTransactions(txParamsHash)).to.eq(TransactionStatus.NonExistent);

      const flipperAfter = await flipper.state(0);
      expect(flipperBefore).to.not.eq(flipperAfter);
    });
  });

  describe("Executing transaction", async () => {
    let firstTransactionDataHash: string;
    let firstTransactionHash: string;
    let firstTransactionEta: BigNumber;
    const firstExecutionDelayDaysFromNow = 3;

    let secondTransactionDataHash: string;
    let secondTransactionHash: string;
    let secondTransactionEta: BigNumber;
    const differenceBetweenFirstExecutionDelayAndSecondInDays = 1;

    let queuedTransactions: QueuedTransaction[] = [];

    before("deploy contracts", async () => {
      await deploy();

      queuedTransactions = [
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(0)).data as string
        },
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(1)).data as string
        }
      ];

      const timestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
      // at least one from properties (queuedTransactions, eta) has to differ between transactions
      // because otherwise they end up having the same data hash and approve on either approves 1st one
      firstTransactionEta = BigNumber.from(timestamp).add(BigNumber.from(firstExecutionDelayDaysFromNow * DAY));

      const firstTransaction: ContractTransaction = await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, firstTransactionEta);
      const firstReceipt: ContractReceipt = await firstTransaction.wait();
      ({ txParamsHash: firstTransactionDataHash } = extractTxParamsHashAndTxHashFromSingleTransaction([firstReceipt], "QueuedTransactionsBatch"));
      firstTransactionHash = firstTransaction.hash;

      secondTransactionEta = BigNumber.from(timestamp).add(
        BigNumber.from((firstExecutionDelayDaysFromNow + differenceBetweenFirstExecutionDelayAndSecondInDays) * DAY)
      );
      const secondTransaction: ContractTransaction = await timelock
        .connect(proposer)
        .queueTransactionsBatch(queuedTransactions, secondTransactionEta);
      const secondReceipt: ContractReceipt = await secondTransaction.wait();
      ({ txParamsHash: secondTransactionDataHash } = extractTxParamsHashAndTxHashFromSingleTransaction([secondReceipt], "QueuedTransactionsBatch"));
      secondTransactionHash = secondTransaction.hash;

      await (await timelock.connect(owner).approveTransactionsBatch(firstTransactionDataHash)).wait();
      await (await timelock.connect(owner).approveTransactionsBatch(secondTransactionDataHash)).wait();
    });

    it("Executing approved transaction by user should fail", async () => {
      const decodedTransaction = await decodeTimelockQueuedTransactions(hre, firstTransactionHash);
      await expectToFail(
        () => timelock.connect(user).executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta),
        "Timelock: only the executor or owner can perform this action"
      );
    });

    it("Executing approved transaction by proposer should fail", async () => {
      const decodedTransaction = await decodeTimelockQueuedTransactions(hre, firstTransactionHash);
      await expectToFail(
        () => timelock.connect(proposer).executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta),
        "Timelock: only the executor or owner can perform this action"
      );
    });

    it("Executing approved transaction by owner before eta should fail", async () => {
      const decodedTransaction = await decodeTimelockQueuedTransactions(hre, firstTransactionHash);

      await expectToFail(
        () => timelock.connect(owner).executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta),
        "Timelock: Transaction hasn't surpassed the execution delay."
      );
    });

    it("Simluate time elase", async () => {
      await simulateTimeElapseInSeconds(firstExecutionDelayDaysFromNow * DAY);
    });

    it("Executing approved transaction by owner should work", async () => {
      const decodedTransaction = await decodeTimelockQueuedTransactions(hre, firstTransactionHash);
      const tx = await timelock.connect(owner).executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta);
      const receipt: ContractReceipt = await tx.wait();

      expectEvent(receipt, "ExecutedTransaction");
      expect(await flipper.state(0)).to.be.equal(true, "invalid state[0]");
      expect(await flipper.state(1)).to.be.equal(true, "invalid state[1]");
      expect(await flipper.state(2)).to.be.equal(false, "invalid state[2]");

      expect(await timelock.queuedTransactions(firstTransactionDataHash)).to.be.equal(TransactionStatus.NonExistent);
    });

    it("Owner cannot execute not approved transaction", async () => {
      const decodedTransaction = await decodeTimelockQueuedTransactions(hre, firstTransactionHash);
      await expectToFail(
        () => timelock.connect(owner).executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta),
        "Timelock: Transaction hasn't been approved."
      );
    });

    it("Executing approved transaction by owner after eta grace period should fail", async () => {
      await simulateTimeElapseInSeconds(GRACE_PERIOD_SECONDS + differenceBetweenFirstExecutionDelayAndSecondInDays * DAY); // wait for after eta - blockchain time was already moved by firstExecutionDelayDaysFromNow in previous tests
      const decodedTransaction = await decodeTimelockQueuedTransactions(hre, secondTransactionHash);
      await expectToFail(
        () => timelock.connect(owner).executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta),
        "Timelock: Transaction is stale."
      );
    });
  });

  describe("Cancelling transaction", async () => {
    let txParamsHash: string;
    let queuedTransactions: QueuedTransaction[] = [];

    before("deploy contracts", async () => {
      await deploy();
      queuedTransactions = [
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(0)).data as string
        }
      ];

      const timestamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(EXECUTION_DELAY + MARGIN_SECONDS);

      const receipt = await (await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta)).wait();
      ({ txParamsHash } = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "QueuedTransactionsBatch"));
    });

    it("Queueing transaction by proposer should work", async () => {
      expect(await timelock.queuedTransactions(txParamsHash)).to.be.equal(TransactionStatus.Queued);
    });

    it("Canceling transactions by user should fail", async () => {
      await expectToFail(async () => await timelock.connect(user).cancelTransactionsBatch(txParamsHash), "Ownable: caller is not the owner");
    });

    it("Canceling transactions by proposer should fail", async () => {
      await expectToFail(async () => await timelock.connect(proposer).cancelTransactionsBatch(txParamsHash), "Ownable: caller is not the owner");
    });

    it("Canceling transactions by owner should work", async () => {
      const tx = await timelock.connect(owner).cancelTransactionsBatch(txParamsHash);
      const receipt = await tx.wait();

      expectEventWithArgs(receipt, "CancelledTransactionsBatch", [txParamsHash]);
      const dataFromReceipt = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "CancelledTransactionsBatch");
      expect(dataFromReceipt.txParamsHash).to.eq(txParamsHash);
      expect(await timelock.queuedTransactions(txParamsHash)).to.be.equal(TransactionStatus.NonExistent);
    });

    it("Approving a cancelled transaction by owner should fail", async () => {
      await expectToFail(async () => await timelock.connect(owner).approveTransactionsBatch(txParamsHash), "Timelock: transaction is not queued");
    });

    it("Canceling a not queued transaction by proposer should fail", async () => {
      await expectToFail(async () => await timelock.cancelTransactionsBatch(txParamsHash), "Timelock: transaction is not queued");
    });
  });

  describe("Timelock transaction execution", async () => {
    let txParamsHash: string;
    let txHash: string;
    let queuedTransactions: QueuedTransaction[] = [];

    before("deploy contracts", async () => {
      await deploy();
    });

    it("Should queue", async () => {
      queuedTransactions = [
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(0)).data as string
        },
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(1)).data as string
        }
      ];
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      const tx: ContractTransaction = await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta);
      const receipt: ContractReceipt = await tx.wait();
      ({ txParamsHash } = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "QueuedTransactionsBatch"));
      txHash = tx.hash;
    });

    it("Proposer can queue a transaction", async () => {
      expect(await timelock.queuedTransactions(txParamsHash)).to.be.equal(TransactionStatus.Queued);
    });

    it("Proposer cannot execute unapproved transaction", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY));
      await expectToFail(() => timelock.executeTransactionsBatch(queuedTransactions, eta), "Timelock: Transaction hasn't been approved.");
    });

    it("Owner can approve transaction", async () => {
      const tx = await timelock.connect(owner).approveTransactionsBatch(txParamsHash);
      const receipt = await tx.wait();

      expectEventWithArgs(receipt, "ApprovedTransactionsBatch", [txParamsHash]);
      const dataFromReceipt = extractTxParamsHashAndTxHashFromSingleTransaction([receipt], "ApprovedTransactionsBatch");
      expect(dataFromReceipt.txParamsHash).to.eq(txParamsHash);
      expect(await timelock.queuedTransactions(txParamsHash)).to.be.equal(TransactionStatus.Approved);
    });

    it("Owner can execute a transaction", async () => {
      await simulateTimeElapseInSeconds(EXECUTION_DELAY + MARGIN_SECONDS); // wait for eta

      const decodedTransaction = await decodeTimelockQueuedTransactions(hre, txHash);
      await timelock.connect(owner).executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta);

      expect(await flipper.state(0)).to.be.equal(true, "invalid state[0]");
      expect(await flipper.state(1)).to.be.equal(true, "invalid state[1]");
      expect(await flipper.state(2)).to.be.equal(false, "invalid state[2]");

      expect(await timelock.queuedTransactions(txParamsHash)).to.be.equal(TransactionStatus.NonExistent);
    });
  });

  describe("Returning pending transactions", async () => {
    let queuedTransactions: QueuedTransaction[] = [];

    beforeEach("deploy contracts", async () => {
      await deploy();

      queuedTransactions = [
        {
          recipient: flipper.address,
          value: 0,
          data: (await flipper.populateTransaction.flip(0)).data as string
        }
      ];
    });

    it("Should return pending transactions", async () => {
      const timestamp = await (await hre.ethers.provider.getBlock("latest")).timestamp;
      const eta1 = BigNumber.from(timestamp).add(BigNumber.from(EXECUTION_DELAY + MARGIN_SECONDS));

      await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta1);

      const eta2 = eta1.add(1000);
      await timelock.connect(proposer).queueTransactionsBatch(queuedTransactions, eta2);

      const pending1 = await timelock.getPendingTransactions();
      expect(pending1.length).to.eq(2);
      expect(pending1.map(t => t.status)).to.eql([TransactionStatus.Queued, TransactionStatus.Queued]);

      await timelock.connect(owner).approveTransactionsBatch(pending1[0].txParamsHash);
      const pending2 = await timelock.getPendingTransactions();

      expect(pending2.length).to.eq(2);
      expect(pending2.map(t => t.status)).to.eql([TransactionStatus.Approved, TransactionStatus.Queued]);

      await timelock.connect(owner).cancelTransactionsBatch(pending2[1].txParamsHash);
      const pending3 = await timelock.getPendingTransactions();

      expect(pending3.length).to.eq(1);
      expect(pending3.map(t => t.status)).to.eql([TransactionStatus.Approved]);

      await simulateTimeElapseInSeconds(EXECUTION_DELAY + MARGIN_SECONDS); // wait for eta

      await timelock.connect(owner).executeTransactionsBatch(queuedTransactions, eta1);
      const pending4 = await timelock.getPendingTransactions();

      expect(pending4.length).to.eq(0);
    });
  });

  describe("Using Recorder to queue", async () => {
    let txParamsHash: string;
    let txHash: string;

    before("Recording and executing recorder transactoin", async () => {
      await deploy();

      // With use of Recorder and RecordableContract we are going to record flipper transactions
      // and execute them with TimelockStrategy that will send them to timelock

      // to initialize  Recorder:
      // 1. initialize strategy
      // 1.1 speify strategy-speific params
      const blockBefore = await hre.ethers.provider.getBlock("latest");
      const timestamp = blockBefore.timestamp;
      const eta = timestamp + 3 * DAY + 100;

      // 2. initialize Recorder with a strategy
      const recorder: Recorder = new Recorder(
        new TimelockStrategy({
          timelock: timelock.connect(proposer),
          eta: eta
        })
      );

      // To initialize RecordableContract
      // 1. have a initialized Recorder
      // 2. initialize Contract - already initialized
      // 3. initialize RecordableContract
      const flipperRecordable = new RecordableContract<Flipper>(flipper, recorder);

      // Record transaction
      await flipperRecordable.record.flip("0");
      await flipperRecordable.record.flip("1");

      const receipts = await recorder.execute();
      const hashes = extractTxParamsHashAndTxHashFromSingleTransaction(receipts, "QueuedTransactionsBatch");
      txParamsHash = hashes.txParamsHash;
      txHash = hashes.txHash;

      expect(await timelock.queuedTransactions(txParamsHash)).to.be.equal(TransactionStatus.Queued);
    });

    it("Approve", async () => {
      await timelock.connect(owner).approveTransactionsBatch(txParamsHash);
      expect(await timelock.queuedTransactions(txParamsHash)).to.be.equal(TransactionStatus.Approved);
    });

    it("Executing using decoded data got from txHash", async () => {
      await simulateTimeElapseInSeconds(3 * DAY + 100);

      const decodedTransaction = await decodeTimelockQueuedTransactions(hre, txHash);
      await timelock.executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta);

      expect(await flipper.state(0)).to.be.equal(true);
      expect(await flipper.state(1)).to.be.equal(true);
      expect(await flipper.state(2)).to.be.equal(false);
      expect(await timelock.queuedTransactions(txParamsHash)).to.be.equal(TransactionStatus.NonExistent);
    });
  });
});
