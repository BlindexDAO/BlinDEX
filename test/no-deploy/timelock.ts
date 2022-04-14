import { Recorder } from "../../utils/Recorder/Recorder";
import { TimelockStrategy } from "../../utils/Recorder/strategies/TimelockStrategy";
import { RecordableContract } from "../../utils/Recorder/RecordableContract";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import { Flipper, Timelock } from "../../typechain";
import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import { decodeTimelockQueuedTransactions, extractDataHashAndTxHash, QueuedTransaction, TransactionStatus } from "../../utils/TimelockHelpers";
import { expectToFail } from "../helpers/common";
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

  //todo ag more tests
  describe("Authentication", async () => {
    beforeEach("deploy contracts", async () => {
      await deploy();
    });

    it("Queueing should fail when called not by admin", async () => {
      const populated = await flipper.populateTransaction.flip(0);
      const queued: QueuedTransaction = {
        target: flipper.address,
        value: 0,
        signature: "",
        data: populated.data as string
      };

      const now = await (await ethers.provider.getBlock("latest")).timestamp;
      const eta = BigNumber.from(now).add(BigNumber.from(3 * DAY));

      await expectToFail(() => timelock.connect(user).queueTransactionsBatch([queued], eta), "Timelock: only admin can perform this action");
    });
  });

  describe("Sending more than one batched transaction", async () => {
    let txDataHash: string;
    let txHash: string;
    let queuedTransactions: QueuedTransaction[] = [];
    let eta: BigNumber;

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
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestamp = blockBefore.timestamp;
      eta = BigNumber.from(timestamp).add(BigNumber.from(3 * DAY));

      const tx: ContractTransaction = await timelock.queueTransactionsBatch(queuedTransactions, eta);
      const receipt: ContractReceipt = await tx.wait();
      txDataHash = receipt.events?.filter(x => x.event === "QueuedTransactionsBatch")[0].args?.txDataHash;
      txHash = tx.hash;
    });

    it("Queueing two transaction by admin should work", async () => {
      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.Queued);
    });

    it("Executing an unapproved transaction should fail", async () => {
      await expectToFail(() => timelock.executeTransactionsBatch(queuedTransactions, eta), "Timelock: Transaction hasn't been approved.");
    });

    it("Approvig transaction by owner should work", async () => {
      const receipt = await (await timelock.connect(owner).approveTransactionsBatch(txDataHash)).wait();
      const txDataHashFromReceipt = extractDataHashAndTxHash(receipt).txDataHash;

      expect(txDataHashFromReceipt).to.eq(txDataHash);
      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.Approved);
    });

    it("Executing a transaction before ETA should fail", async () => {
      await expectToFail(() => timelock.executeTransactionsBatch(queuedTransactions, eta), "Timelock: Transaction hasn't surpassed time lock.");
    });

    it("Executing two transaction by admin should work", async () => {
      await simulateTimeElapseInSeconds(3 * DAY + 100); // wait for ETA

      const decodedTransaction = await decodeTimelockQueuedTransactions(txHash);
      await timelock.executeTransactionsBatch(decodedTransaction.queuedTransactions, decodedTransaction.eta);

      expect(await flipper.state(0)).to.be.equal(true, "invalid state[0]");
      expect(await flipper.state(1)).to.be.equal(true, "invalid state[1]");
      expect(await flipper.state(2)).to.be.equal(false, "invalid state[2]");

      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.NonExistent);
    });
  });

  describe.only("Cancelling transaction", async () => {
    let txDataHash: string;
    let queuedTransactions: QueuedTransaction[] = [];

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
      const eta = BigNumber.from(timestamp).add(BigNumber.from(3 * DAY));

      const receipt = await (await timelock.queueTransactionsBatch(queuedTransactions, eta)).wait();
      ({ txDataHash } = extractDataHashAndTxHash(receipt));
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
      const receipt = await (await timelock.connect(admin).cancelTransactionsBatch(txDataHash)).wait();
      const txDataHashFromReceipt = extractDataHashAndTxHash(receipt).txDataHash;

      expect(txDataHashFromReceipt).to.eq(txDataHash);
      expect(await timelock.queuedTransactions(txDataHash)).to.be.equal(TransactionStatus.NonExistent);
    });

    it("Approvig a cancelled transaction by owner should fail", async () => {
      await expectToFail(async () => await timelock.connect(owner).approveTransactionsBatch(txDataHash), "Timelock: transaction is not queued");
    });
  });

  describe("Using Recorder to queue", async () => {
    let txDataHash: string;
    let txHash: string;

    before("Recording and executing recorder transactoin", async () => {
      await deploy();

      // With use of Recorder and RecordableContract we are going to record flipper transactions
      // and execute them with TimelockStrategy that will send them to timelock

      // to initialize  Recorder:
      // 1. initialize strategy
      // 1.1 speify strategy-speific params
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestamp = blockBefore.timestamp;
      const eta = (timestamp + 3 * DAY + 100).toString();

      // 2. initialize Recorder with a stratedy
      const recorder: Recorder = new Recorder(
        new TimelockStrategy({
          timelock: timelock,
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

      const receipt = await recorder.execute();
      const hashes = extractDataHashAndTxHash(receipt);
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
