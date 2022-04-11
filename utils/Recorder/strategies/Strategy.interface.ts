import { UnsignedTransaction } from "ethers";
import { ContractReceipt } from "ethers";

export type StrategyReceipt = undefined | ContractReceipt[];

// interface for strategy function that somehow executes list of unsigned transaction
// examples: execute one By one, batch all and send as one, send to gnosis safe etc.
// @txsToExecute: list of UnsignedTransaction to be executed
// @params?: additional object containing strategy specific parameters
export interface Strategy {
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  strategyFunction(txsToExecute: UnsignedTransaction[], params?: object): Promise<StrategyReceipt>;
}
