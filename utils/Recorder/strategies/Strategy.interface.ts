import { UnsignedTransaction } from "ethers";
import { ContractReceipt } from "ethers";

// interface for strategy function that somehow executes a list of unsigned transactions
// examples: execute one By one, batch all and send as one, send to gnosis safe etc.
// @txsToExecute: list of UnsignedTransaction to be executed
// @params?: additional object containing strategy specific parameters
export interface Strategy {
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  execute(txsToExecute: UnsignedTransaction[], params?: object): Promise<ContractReceipt[]>;
}
