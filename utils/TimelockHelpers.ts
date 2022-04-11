import { BigNumber } from "ethers";
import { Result } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Timelock__factory } from "../typechain"

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