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

export function extractDataHashAndTxHash(receipt: ContractReceipt, eventName: string) {
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
