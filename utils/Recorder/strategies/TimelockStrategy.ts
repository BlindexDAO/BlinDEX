import { Strategy } from "./Strategy.interface";
import { ContractReceipt, ContractTransaction, UnsignedTransaction } from "ethers";
import { Timelock } from "../../../typechain";

type QueuedTransaction = {
  recipient: string;
  value: number | string;
  data: string;
};

// Strategy specific params
export type TimelockParams = {
  timelock: Timelock;
  executionStartTimestamp: number;
};

// Implementation of Strategy.interface
// Send transactions ony by one to the blockchain
// need to specify during construction:
// Signer - ethers.Signer connected to network
export class TimelockStrategy implements Strategy {
  params: TimelockParams;

  constructor(params_: TimelockParams) {
    this.params = params_;
  }

  async execute(txsToExecute: UnsignedTransaction[]): Promise<ContractReceipt[]> {
    const toSend: QueuedTransaction[] = [];
    while (txsToExecute.length > 0) {
      const toAdd = txsToExecute.shift() as UnsignedTransaction;
      toSend.push({
        recipient: toAdd.to as string,
        value: 0,
        data: toAdd.data as string
      });
    }
    const tx: ContractTransaction = await this.params.timelock.queueTransactionsBatch(toSend, this.params.executionStartTimestamp);
    const receipt: ContractReceipt = await tx.wait();

    return [receipt];
  }
}
