import { BigNumber, ContractReceipt } from "ethers";
import { AbiCoder, ParamType, Result } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { extractTheOnlyEvent } from "./ExtractingEvents";
import { Timelock__factory } from "../typechain";

export type QueuedTransaction = {
  recipient: string;
  value: number;
  data: string;
};

export enum TransactionStatus {
  NonExistent,
  Queued,
  Approved
}

export function decodeQueuedTransactionsBatchParams(decodedTxData: Result) {
  const decodedQueuedTransactions = decodedTxData.transactions as QueuedTransaction[];
  const decodEta = decodedTxData.eta as BigNumber;

  return { queuedTransactions: decodedQueuedTransactions, eta: decodEta };
}

export async function decodeTimelockQueuedTransactions(hre: HardhatRuntimeEnvironment, txHash: string) {
  const txData = (await hre.ethers.provider.getTransaction(txHash)).data;
  const decodedTxData = await Timelock__factory.createInterface().decodeFunctionData("queueTransactionsBatch", txData);

  return decodeQueuedTransactionsBatchParams(decodedTxData);
}

export async function extractTimelockQueuedTransactionsBatchParamsDataAndHash(
  hre: HardhatRuntimeEnvironment,
  txHash: string
): Promise<{ txParamsData: string; txParamsHash: string }> {
  const txData = (await hre.ethers.provider.getTransaction(txHash)).data;
  const contractInterface = await Timelock__factory.createInterface();
  const decodedTxData = contractInterface.decodeFunctionData("queueTransactionsBatch", txData);
  const decodedQueuedTransactions = (decodedTxData.transactions as QueuedTransaction[]).map(x => ({
    recipient: x.recipient,
    value: x.value,
    data: x.data
  }));
  const decodedEta = decodedTxData.eta as BigNumber;

  const encoder = new AbiCoder();
  const txParamsData = encoder.encode(
    [ParamType.from("Transaction(address recipient, uint256 value, bytes data)[]"), "uint"],
    [decodedQueuedTransactions, decodedEta]
  );

  const txParamsHash = hre.ethers.utils.keccak256(txParamsData);

  return { txParamsData, txParamsHash };
}

export function extractTxParamsHashAndTxHashFromSingleTransaction(
  receipts: ContractReceipt[],
  eventName: string
): { txParamsHash: string; txHash: string } {
  if (receipts.length !== 1) {
    throw new Error(`Unexpected amount of receipts. Received: ${receipts.length}, expected: 1`);
  }

  const receipt = receipts[0];

  const theOnlyTransactionsBatchEvent = extractTheOnlyEvent(receipt, eventName);

  if (!theOnlyTransactionsBatchEvent.args) {
    throw new Error(`Event: ${eventName} is missing args`);
  }

  const txParamsHash = theOnlyTransactionsBatchEvent.args.txParamsHash as string;

  if (!txParamsHash) {
    throw new Error(`Missing txParamsHash`);
  }

  const txHash = theOnlyTransactionsBatchEvent.transactionHash as string;

  if (!txHash) {
    throw new Error(`Missing txHash`);
  }

  return { txParamsHash, txHash };
}
