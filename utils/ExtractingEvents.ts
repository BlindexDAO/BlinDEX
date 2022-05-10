import { ContractReceipt } from "ethers";

export function extractTheOnlyEvent(receipt: ContractReceipt, eventName: string) {
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

  return theOnlyTransactionsBatchEvent;
}
