import { BigNumber, ContractReceipt } from "ethers";
import { AbiCoder, ParamType, Result } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
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

export function decodeQueueTransactionsBatchParams(decodedTxData: Result) {
  const decodedQueuedTransactions = decodedTxData.transactions as QueuedTransaction[];
  const decodedExecutionStartTimestamp = decodedTxData.executionStartTimestamp as BigNumber;

  return { queuedTransactions: decodedQueuedTransactions, executionStartTimestamp: decodedExecutionStartTimestamp };
}

export async function decodeTimelockQueuedTransactions(hre: HardhatRuntimeEnvironment, txHash: string) {
  const txData = (await hre.ethers.provider.getTransaction(txHash)).data;
  const decodedTxData = await Timelock__factory.createInterface().decodeFunctionData("queueTransactionsBatch", txData);
  const decodedQueuedTransactions = decodedTxData.transactions as QueuedTransaction[];
  const decodEdexecutionStartTimestamp = decodedTxData.executionStartTimestamp as BigNumber;

  return { queuedTransactions: decodedQueuedTransactions, executionStartTimestamp: decodEdexecutionStartTimestamp };
}

export async function extractTimelockQueuedTransactionsBatchParamsDataAndHash(hre: HardhatRuntimeEnvironment, txHash: string) {
  const txData = (await hre.ethers.provider.getTransaction(txHash)).data;
  const contractInterface = await Timelock__factory.createInterface();
  const decodedTxData = contractInterface.decodeFunctionData("queueTransactionsBatch", txData);
  const decodedQueuedTransactions = (decodedTxData.transactions as QueuedTransaction[]).map(x => ({
    recipient: x.recipient,
    value: x.value,
    data: x.data
  }));
  const decodedExecutionStartTimestamp = decodedTxData.executionStartTimestamp as BigNumber;

  const encoder = new AbiCoder();
  const txParamsData = encoder.encode(
    [ParamType.from("Transaction(address recipient, uint256 value, bytes data)[]"), "uint"],
    [decodedQueuedTransactions, decodedExecutionStartTimestamp]
  );

  const txParamsHash = hre.ethers.utils.keccak256(txParamsData);

  return { txParamsData, txParamsHash };
}

export function extractTxParamsHashAndTxHashFromSingleTransaction(receipts: ContractReceipt[], eventName: string) {
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

  const txParamsHash = theOnlyTransactionsBatchEvent.args.txParamsHash as string;

  if (!txParamsHash) {
    throw new Error(`Missing txParamsHash`);
  }

  const txHash = receipt.events.filter(x => x.event === eventName)[0].transactionHash as string;

  if (!txHash) {
    throw new Error(`Missing txHash`);
  }

  return { txParamsHash, txHash };
}
