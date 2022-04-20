import { BigNumber, ContractReceipt } from "ethers";
import { Result } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Timelock__factory } from "../typechain";

export type QueuedTransaction = {
  target: string;
  value: number | string;
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

export async function decodeTimelockQueuedTransactions(txHash: string) {
  const txData = (await ethers.provider.getTransaction(txHash)).data;
  const decodedTxData = await Timelock__factory.createInterface().decodeFunctionData("queueTransactionsBatch", txData);
  const decodedQueuedTransactions = decodedTxData.transactions as QueuedTransaction[];
  const decodedEta = decodedTxData.eta as BigNumber;

  return { queuedTransactions: decodedQueuedTransactions, eta: decodedEta };
}

export function extractDataHashAndTxHashFromSingleTransaction(receipts: ContractReceipt[]) {
  const queuedTransactionsBatchEventName = "QueuedTransactionsBatch";

  if (receipts.length !== 0) {
    throw new Error(`Unexpected amount of receipts. Received: ${receipts.length}, expected: 1`);
  }

  const receipt = receipts[0];

  if (!receipt.events) {
    throw new Error("Missing events");
  }

  const queuedTransactionsBatchEvents = receipt.events.filter(x => {
    return x.event === queuedTransactionsBatchEventName;
  });

  if (queuedTransactionsBatchEvents.length === 0) {
    throw new Error(`Missing event: ${queuedTransactionsBatchEventName}`);
  }

  if (queuedTransactionsBatchEvents.length > 1) {
    throw new Error(`More than 1 event: ${queuedTransactionsBatchEventName}`);
  }

  const theOnlyQueuedTransactionsBatchEvent = queuedTransactionsBatchEvents[0];

  if (!theOnlyQueuedTransactionsBatchEvent.args) {
    throw new Error(`Event: ${queuedTransactionsBatchEventName} is missing args`);
  }

  const txDataHash = theOnlyQueuedTransactionsBatchEvent.args.txDataHash as string;

  if (!txDataHash) {
    throw new Error(`Missing txDataHash`);
  }

  const txHash = receipt.events.filter(x => x.event === queuedTransactionsBatchEventName)[0].transactionHash as string;

  if (!txHash) {
    throw new Error(`Missing txHash`);
  }

  return { txDataHash, txHash };
}
