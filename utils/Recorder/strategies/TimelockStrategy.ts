import { Strategy, StrategyReceipt } from "./Strategy.interface";
import { ContractReceipt, ContractTransaction, UnsignedTransaction } from "ethers";
import { Timelock } from "../../../typechain";

type QueuedTransaction = {
  target: string;
  value: number | string;
  signature: string;
  data: string;
};

//Strategy specific params
export type TimelockParams = {
  timelock: Timelock;
  eta: string;
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
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  async strategyFunction(txsToExecute: UnsignedTransaction[]): Promise<StrategyReceipt> {
    const toSend: QueuedTransaction[] = [];
    while (txsToExecute.length > 0) {
      const toAdd = txsToExecute.shift() as UnsignedTransaction;
      toSend.push({
        target: toAdd.to as string,
        value: 0,
        signature: "",
        data: toAdd.data as string
      });
    }
    const tx: ContractTransaction = await this.params.timelock.queueTransactionsBatch(toSend, this.params.eta);
    const receipt: ContractReceipt = await tx.wait();

    return [receipt];
  }
}
