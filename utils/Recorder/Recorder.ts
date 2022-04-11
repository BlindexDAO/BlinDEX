import { UnsignedTransaction } from "ethers";
import { Strategy, StrategyReceipt } from "./strategies/Strategy.interface";

// class responsible for recoding and executing transactions
// construction:
//  strategy - that will be used to execute transactions
export class Recorder {
  recordedTransactions: UnsignedTransaction[] = [];
  executedTransactions: StrategyReceipt[] = [];
  strategy: Strategy;

  constructor(strategy_: Strategy) {
    this.strategy = strategy_;
  }

  // pushes an unsigned transaction (the paprameter) to the recordedTransaction List
  record(transaction: UnsignedTransaction) {
    this.recordedTransactions.push(transaction);
  }

  // execute all recorderTransaction in order using strategy and clears recordedTransaction
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  async execute(): Promise<StrategyReceipt> {
    const response: StrategyReceipt = await this.strategy.strategyFunction(this.recordedTransactions);
    this.recordedTransactions = [];
    this.executedTransactions.concat(response);
    return response;
  }

  print() {
    console.log(this.recordedTransactions);
  }
}
