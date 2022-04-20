import { Recorder } from "../../utils/Recorder/Recorder";
import { TimelockStrategy } from "../../utils/Recorder/strategies/TimelockStrategy";
import { RecordableContract } from "../../utils/Recorder/RecordableContract";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import { Flipper, Timelock } from "../../typechain";
import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import {
  decodeTimelockQueuedTransactions,
  extractDataHashAndTxHashFromSingleTransaction,
  QueuedTransaction,
  TransactionStatus
} from "../../utils/TimelockHelpers";
import { expectEvent, expectToFail } from "../helpers/common";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";

chai.use(cap);
chai.use(solidity);

const DAY = 86400;

describe("Timelock", () => {
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let flipper: Flipper;
  let timelock: Timelock;

  async function deploy() {
    [owner, admin, user] = await ethers.getSigners();
    const Flipper = await ethers.getContractFactory("Flipper");
    flipper = (await Flipper.deploy()) as Flipper;
    await flipper.deployed();
    const TimeLockFactory = await ethers.getContractFactory("Timelock");
    timelock = (await TimeLockFactory.deploy(admin.address, 2 * DAY)) as Timelock;
    timelock = timelock.connect(admin);

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
      const delay = await timelock.delay();
      const timelockAdmin = await timelock.admin();
      const timelockOwner = await timelock.owner();

      expect(state0).to.equal(false);
      expect(state1).to.equal(false);
      expect(state2).to.equal(false);
      expect(flipperOwner).to.equal(timelock.address);
      expect(timelockOwner).to.equal(owner.address);
      expect(timelockAdmin).to.equal(admin.address);
      expect(delay).to.equal(BigNumber.from(2 * DAY));
    });

    it("Flipping should fail when called not by admin", async () => {
      await expect(flipper.flip(0)).to.be.reverted;
    });
  });

  describe("Queueing transaction", async () => {
    let queuedTransactions: QueuedTransaction[] = [];
    let eta: BigNumber;
    const etaDaysFromNow = 3;
    const gracePeriod = 14;

    before("deploy contracts", async () => {
      await deploy();
      queuedTransactions = [
        {
          target: flipper.address,
          value: 0,
          signature: "",
          data: (await flipper.populateTransaction.flip(0)).data as string
        },
        {
          target: flipper.address,
          value: 0,
          signature: "",
          data: (await flipper.populateTransaction.flip(1)).data as string
        }
      ];
    });

    it("Queueing transaction by owner with proper ETA should fail", async () => {
      const timestamp = await (await ethers.provider.getBlock("latest")).timestamp;
      eta = BigNumber.from(timestamp).add(BigNumber.from(etaDaysFromNow * DAY));

      await expectToFail(
        () => timelock.connect(owner).queueTransactionsBatch(queuedTransactions, eta),
        "Timelock: only admin can perform this action"
      );
    });

    it("Queueing transaction by user with proper ETA should fail", async () => {
      const timestamp = await (await ethers.provider.getBlock("latest")).timestamp;
      eta = BigNumber.from(timestamp).add(BigNumber.from(etaDaysFromNow * DAY));

      await expectToFail(
        () => timelock.connect(user).queueTransactionsBatch(queuedTransactions, eta),
        "Timelock: only admin can perform this action"
      );
    });

    it("Queueing transaction by admin with ETA before delay should fail", async () => {
      const timestamp = await (await ethers.provider.getBlock("latest")).timestamp;
      eta = BigNumber.from(timestamp).add(BigNumber.from((etaDaysFromNow - 1) * DAY));

      await expectToFail(() => timelock.queueTransactionsBatch(queuedTransactions, eta), "Timelock: Estimated execution time must satisfy delay.");
    });

    it("Queueing transaction by admin with ETA after delay and grace period should fail", async () => {
      const timestamp = await (await ethers.provider.getBlock("latest")).timestamp;
      eta = BigNumber.from(timestamp).add(BigNumber.from(etaDaysFromNow * DAY).add(BigNumber.from(gracePeriod * DAY)));

      await expectToFail(
        () => timelock.queueTransactionsBatch(queuedTransactions, eta),
        "Timelock: Estimated execution time must satisfy delay and grace period."
      );
    });

    it("Queueing transaction by admin with proper ETA should work", async () => {
      const timestamp = await (await ethers.provider.getBlock("latest")).timestamp;
      eta = BigNumber.from(timestamp).add(BigNumber.from(etaDaysFromNow * DAY));

      const tx: ContractTransaction = await timelock.queueTransactionsBatch(queuedTransactions, eta);
      const receipt: ContractReceipt = await tx.wait();
      expectEvent(receipt, "QueuedTransactionsBatch");
      const dataFromReceipt = extractDataHashAndTxHash(receipt, "QueuedTransactionsBatch");

      expect(dataFromReceipt.txDataHash).to.be.ok;
      expect(dataFromReceipt.txHash).to.be.ok;
      expect(await timelock.queuedTransactions(dataFromReceipt.txDataHash)).to.be.equal(TransactionStatus.Queued);
    });
  });

  describe("Approving transaction", async () => {
    let txDataHash: string;
    let queuedTransactions: QueuedTransaction[] = [];
    let eta: BigNumber;

    before("deploy contracts", async () => {
      await deploy();
      queuedTransactions = [
        {
          target: flipper.address,
          value: 0,
          signature: "",
          data: (await flipper.populateTransaction.flip(0)).data as string
        },
        {
          target: flipper.address,
          value: 0,
          signature: "",
          data: (await flipper.populateTransaction.flip(1)).data as string
        }
      ];
      const timestamp = await (await ethers.provider.getBlock("latest")).timestamp;
      eta = BigNumber.from(timestamp).add(BigNumber.from(3 * DAY));

      const tx: ContractTransaction = await timelock.queueTransactionsBatch(queuedTransactions, eta);
      const receipt: ContractReceipt = await tx.wait();
      ({ txDataHash } = extractDataHashAndTxHash(receipt, "QueuedTransactionsBatch"));
      txHash = tx.hash;
    });

    it("Approving transaction by admin should fail", async () => {
      await expectToFail(() => timelock.approveTransactionsBatch(txDataHash), "Ownable: caller is not the owner");
    });

    it("Approving transaction by user should fail", async () => {
      await expectToFail(() => timelock.connect(user).approveTransactionsBatch(txDataHash), "Ownable: caller is not the owner");
    });

    it("Approving transaction by owner should work", async () => {
      const tx: ContractTransaction = await timelock.connect(owner).approveTransactionsBatch(txDataHash);
      const receipt: ContractReceipt = await tx.wait();
      expectEvent(receipt, "ApprovedTransactionsBatch");
      const dataFromReceipt = extractDataHashAndTxHashFromSingleTransaction(receipt, "ApprovedTransactionsBatch");

      expect(dataFromReceipt.txDataHash).to.be.ok;
      expect(dataFromReceipt.txHash).to.be.ok;
      expect(dataFromReceipt.txDataHash).to.eq(txDataHash);
      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.Approved);
    });

    it("Approving not queued transaction by owner should fail ", async () => {
      await expectToFail(() => timelock.connect(owner).approveTransactionsBatch(txDataHash), "Timelock: transaction is not queued");
    });
  });

  describe("Executing transaction", async () => {
    let firstTransactionDataHash: string;
    let firstTransactionHash: string;
    let firstTransactionEta: BigNumber;
    const firstEtaDaysFromNow = 3;

    let secondTransactionDataHash: string;
    let secondTransactionHash: string;
    let secondTransactionEta: BigNumber;
    const differenceBetweenFirstEtaAndSecond = 1;

    let queuedTransactions: QueuedTransaction[] = [];
    const gracePeriod = 14;

    before("deploy contracts", async () => {
      await deploy();

      queuedTransactions = [
        {
          target: flipper.address,
          value: 0,
          signature: "",
          data: (await flipper.populateTransaction.flip(0)).data as string
        },
        {
          target: flipper.address,
          value: 0,
          signature: "",
          data: (await flipper.populateTransaction.flip(1)).data as string
        }
      ];

      const timestamp = await (await ethers.provider.getBlock("latest")).timestamp;
      // at least one from properties (queuedTransactions, eta) has to differ between transactions
      // because otherwise they end up having the same data hash and approve on either approves 1st one
      firstTransactionEta = BigNumber.from(timestamp).add(BigNumber.from(firstEtaDaysFromNow * DAY));

      const firstTransaction: ContractTransaction = await timelock.queueTransactionsBatch(queuedTransactions, firstTransactionEta);
      const firstReceipt: ContractReceipt = await firstTransaction.wait();
      ({ txDataHash: firstTransactionDataHash } = extractDataHashAndTxHash(firstReceipt, "QueuedTransactionsBatch"));
      firstTransactionHash = firstTransaction.hash;

      secondTransactionEta = BigNumber.from(timestamp).add(BigNumber.from((firstEtaDaysFromNow + differenceBetweenFirstEtaAndSecond) * DAY));
      const secondTransaction: ContractTransaction = await timelock.queueTransactionsBatch(queuedTransactions, secondTransactionEta);
      const secondReceipt: ContractReceipt = await secondTransaction.wait();
      ({ txDataHash: secondTransactionDataHash } = extractDataHashAndTxHash(secondReceipt, "QueuedTransactionsBatch"));
      secondTransactionHash = secondTransaction.hash;

      await (await timelock.connect(owner).approveTransactionsBatch(firstTransactionDataHash)).wait();
      await (await timelock.connect(owner).approveTransactionsBatch(secondTransactionDataHash)).wait();
    });

    it("Executing approved transaction by user should fail", async () => {
      const decodedTransaction = await decodeTimelockQueuedTransactions(firstTransactionHash);
      await expectToFail(
        () => timelock.connect(user).executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta),
        "Timelock: only admin can perform this action"
      );
    });

    it("Executing approved transaction by owner should fail", async () => {
      const decodedTransaction = await decodeTimelockQueuedTransactions(firstTransactionHash);
      await expectToFail(
        () => timelock.connect(owner).executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta),
        "Timelock: only admin can perform this action"
      );
    });

    it("Executing approved transaction by admin before ETA should fail", async () => {
      const decodedTransaction = await decodeTimelockQueuedTransactions(firstTransactionHash);
      await expectToFail(
        () => timelock.executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta),
        "Timelock: Transaction hasn't surpassed time lock."
      );
    });

    it("Executing approved transaction by admin should work", async () => {
      await simulateTimeElapseInSeconds(firstEtaDaysFromNow * DAY); // todo nie działa - transaction is stale - poprzednie wywołania przesunęły czas tak, że już ne przejdzie, moze osobny test? albo zmienic kolejnosc czy cos do tego testu z eta grace period pewnie trzeba bedzie stworzyc nowa transakcje z nowym eta
      const decodedTransaction = await decodeTimelockQueuedTransactions(firstTransactionHash);
      const tx = await timelock.executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta);
      const receipt: ContractReceipt = await tx.wait();

      expectEvent(receipt, "ExecutedTransaction");
      expect(await flipper.state(0)).to.be.equal(true, "invalid state[0]");
      expect(await flipper.state(1)).to.be.equal(true, "invalid state[1]");
      expect(await flipper.state(2)).to.be.equal(false, "invalid state[2]");

      expect(await timelock.queuedTransactions(firstTransactionDataHash)).to.be.equal(TransactionStatus.NonExistent);
    });

    it("Admin cannot execute not approved transaction", async () => {
      const decodedTransaction = await decodeTimelockQueuedTransactions(firstTransactionHash);
      await expectToFail(
        () => timelock.executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta),
        "Timelock: Transaction hasn't been approved."
      );
    });

    it("Executing approved transaction by admin after ETA grace period should fail", async () => {
      await simulateTimeElapseInSeconds((gracePeriod + differenceBetweenFirstEtaAndSecond) * DAY); // wait for after ETA - blockchain time was already moved by firstEtaDaysFromNow in previous tests
      const decodedTransaction = await decodeTimelockQueuedTransactions(secondTransactionHash);
      await expectToFail(
        () => timelock.executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta),
        "Timelock: Transaction is stale."
      );
    });
  });

  describe("Cancelling transaction", async () => {
    let txDataHash: string;
    let queuedTransactions: QueuedTransaction[] = [];
    const etaDaysFromNow = 3;
    before("deploy contracts", async () => {
      await deploy();
      queuedTransactions = [
        {
          target: flipper.address,
          value: 0,
          signature: "",
          data: (await flipper.populateTransaction.flip(0)).data as string
        }
      ];

      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(timestamp).add(BigNumber.from(etaDaysFromNow * DAY));

      const receipt = await (await timelock.queueTransactionsBatch(queuedTransactions, eta)).wait();
      ({ txDataHash } = extractDataHashAndTxHashFromSingleTransaction(receipt, "QueuedTransactionsBatch"));
    });

    it("Queueing transaction by admin should work", async () => {
      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.Queued);
    });

    it("Canceling transactions by user should fail", async () => {
      await expectToFail(
        async () => await timelock.connect(user).cancelTransactionsBatch(txDataHash),
        "Timelock: only admin can perform this action"
      );
    });

    it("Canceling transactions by owner should fail", async () => {
      await expectToFail(
        async () => await timelock.connect(owner).cancelTransactionsBatch(txDataHash),
        "Timelock: only admin can perform this action"
      );
    });

    it("Canceling transactions by admin should work", async () => {
      const tx = await timelock.connect(admin).cancelTransactionsBatch(txDataHash);
      const receipt = await tx.wait();

      expectEvent(receipt, "CancelledTransactionsBatch");
      const dataFromReceipt = extractDataHashAndTxHashFromSingleTransaction(receipt, "CancelledTransactionsBatch");
      expect(dataFromReceipt.txDataHash).to.eq(txDataHash);
      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.NonExistent);
    });

    it("Approving a cancelled transaction by owner should fail", async () => {
      await expectToFail(async () => await timelock.connect(owner).approveTransactionsBatch(txDataHash), "Timelock: transaction is not queued");
    });

    it("Canceling a not queued transaction by admin should fail", async () => {
      await expectToFail(async () => await timelock.cancelTransactionsBatch(txDataHash), "Timelock: transaction is not queued");
    });
  });

  describe("Timelock transaction execution", async () => {
    let txDataHash: string;
    let txHash: string;
    let queuedTransactions: QueuedTransaction[] = [];
    let eta: BigNumber;
    const etaDaysFromNow = 3;

    before("deploy contracts", async () => {
      await deploy();
    });

    it("Should queue", async () => {
      queuedTransactions = [
        {
          target: flipper.address,
          value: 0,
          signature: "",
          data: (await flipper.populateTransaction.flip(0)).data as string
        },
        {
          target: flipper.address,
          value: 0,
          signature: "",
          data: (await flipper.populateTransaction.flip(1)).data as string
        }
      ];
      const timestamp = await (await ethers.provider.getBlock("latest")).timestamp;
      eta = BigNumber.from(timestamp).add(BigNumber.from(etaDaysFromNow * DAY));

      const tx: ContractTransaction = await timelock.queueTransactionsBatch(queuedTransactions, eta);
      const receipt: ContractReceipt = await tx.wait();
      ({ txDataHash } = extractDataHashAndTxHash(receipt, "QueuedTransactionsBatch"));
      txHash = tx.hash;
    });

    it("Admin can queue a transaction", async () => {
      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.Queued);
    });

    it("Admin cannot execute unapproved transaction", async () => {
      await expectToFail(() => timelock.executeTransactionsBatch(queuedTransactions, eta), "Timelock: Transaction hasn't been approved.");
    });

    it("Owner can approve transaction", async () => {
      const tx = await timelock.connect(owner).approveTransactionsBatch(txDataHash);
      const receipt = await tx.wait();

      expectEvent(receipt, "ApprovedTransactionsBatch");
      const dataFromReceipt = extractDataHashAndTxHash(receipt, "ApprovedTransactionsBatch");
      expect(dataFromReceipt.txDataHash).to.eq(txDataHash);
      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.Approved);
    });

    it("Admin can execute a transaction", async () => {
      await simulateTimeElapseInSeconds((etaDaysFromNow + 1) * DAY); // wait for ETA

      const decodedTransaction = await decodeTimelockQueuedTransactions(txHash);
      await timelock.executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta);

      expect(await flipper.state(0)).to.be.equal(true, "invalid state[0]");
      expect(await flipper.state(1)).to.be.equal(true, "invalid state[1]");
      expect(await flipper.state(2)).to.be.equal(false, "invalid state[2]");

      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.NonExistent);
    });
  });

  describe.only("Using Recorder to queue", async () => {
    let txDataHash: string;
    let txHash: string;

    before("Recording and executing recorder transactoin", async () => {
      await deploy();

      // With use of Recorder and RecordableContract we are going to record flipper transactions
      // and execute them with TimelockStrategy that will send them to timelock

      // to initialize  Recorder:
      // 1. initialize strategy
      // 1.1 speify strategy-speific params
      const blockBefore = await ethers.provider.getBlock("latest");
      const timestamp = blockBefore.timestamp;
      const eta = timestamp + 3 * DAY + 100;

      // 2. initialize Recorder with a strategy
      const recorder: Recorder = new Recorder(
        new TimelockStrategy({
          timelock: timelock,
          etaSeconds: eta
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

      const receipt = await recorder.execute();
      const hashes = extractDataHashAndTxHashFromSingleTransaction(receipt, "QueuedTransactionsBatch");
      txDataHash = hashes.txDataHash;
      txHash = hashes.txHash;

      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.Queued);
    });

    it("Approve", async () => {
      await timelock.connect(owner).approveTransactionsBatch(txDataHash);
      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.Approved);
    });

    it("Executing using decoded data got from txHash", async () => {
      await simulateTimeElapseInSeconds(3 * DAY + 100);

      const decodedTransaction = await decodeTimelockQueuedTransactions(txHash);
      await timelock.executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta);

      expect(await flipper.state(0)).to.be.equal(true);
      expect(await flipper.state(1)).to.be.equal(true);
      expect(await flipper.state(2)).to.be.equal(false);
      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.NonExistent);
    });
  });
});
