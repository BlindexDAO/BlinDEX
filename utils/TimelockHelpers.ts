import { BigNumber, ContractReceipt } from "ethers";
import { AbiCoder, ParamType, Result } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Timelock__factory } from "../typechain";

export type QueuedTransaction = {
  target: string;
  value: number;
  signature: string;
  data: string;
};

export enum TransactionStatus {
  NonExistent,
  Queued,
  Approved
}

export function decodeQueueTransactionsBatchParams(decodedTxData: Result) {
  const decodedQueuedTransactions = decodedTxData.transactions as QueuedTransaction[];
  const decodedEta = decodedTxData.eta as BigNumber;

  return { queuedTransactions: decodedQueuedTransactions, eta: decodedEta };
}

export async function decodeTimelockQueuedTransactions(hre: HardhatRuntimeEnvironment, txHash: string) {
  const txData = (await hre.ethers.provider.getTransaction(txHash)).data;
  const decodedTxData = await Timelock__factory.createInterface().decodeFunctionData("queueTransactionsBatch", txData);
  const decodedQueuedTransactions = decodedTxData.transactions as QueuedTransaction[];
  const decodedEta = decodedTxData.eta as BigNumber;

  return { queuedTransactions: decodedQueuedTransactions, eta: decodedEta };
}

export async function extractTimelockQueuedTransactionsDataHash(hre: HardhatRuntimeEnvironment, txHash: string) {
  const txData = (await hre.ethers.provider.getTransaction(txHash)).data;
  const contractInterface = await Timelock__factory.createInterface();
  const decodedTxData = contractInterface.decodeFunctionData("queueTransactionsBatch", txData);
  const decodedQueuedTransactions = (decodedTxData.transactions as QueuedTransaction[]).map(x => ({
    target: x.target,
    value: x.value,
    signature: x.signature,
    data: x.data
  }));
  const decodedEta = decodedTxData.eta as BigNumber;

  const encoder = new AbiCoder();
  const txDataHash = hre.ethers.utils.keccak256(
    encoder.encode(
      [ParamType.from("Transaction(address target, uint256 value, string signature, bytes data)[]"), "uint"],
      [decodedQueuedTransactions, decodedEta]
    )
  );

  return txDataHash;
}

export function extractDataHashAndTxHashFromSingleTransaction(receipts: ContractReceipt[], eventName: string) {
  if (receipts.length !== 1) {
    throw new Error(`Unexpected amount of receipts. Received: ${receipts.length}, expected: 1`);
  }

  const receipt = receipts[0];

  if (!receipt.events) {
    throw new Error("Missing events");
  }

  const transactionsBatchEvents = receipt.events.filter(x => {
    return x.event === eventName;
  });

  if (transactionsBatchEvents.length === 0) {
    throw new Error(`Missing event: ${eventName}`);
  }

  if (transactionsBatchEvents.length > 1) {
    throw new Error(`More than 1 event: ${eventName}`);
  }

  const theOnlyTransactionsBatchEvent = transactionsBatchEvents[0];

  if (!theOnlyTransactionsBatchEvent.args) {
    throw new Error(`Event: ${eventName} is missing args`);
  }

  const txDataHash = theOnlyTransactionsBatchEvent.args.txDataHash as string;

  if (!txDataHash) {
    throw new Error(`Missing txDataHash`);
  }

  const txHash = receipt.events.filter(x => x.event === eventName)[0].transactionHash as string;

  if (!txHash) {
    throw new Error(`Missing txHash`);
  }

  return { txDataHash, txHash };
}
