import { ContractReceipt, ContractTransaction, Signer } from "ethers";
import { Strategy } from "./Strategy.interface";
import { UnsignedTransaction } from "ethers";
import { Deferrable } from "ethers/lib/utils";
import { TransactionRequest } from "@ethersproject/abstract-provider";
import { printAndWaitOnTransaction } from "../../DeploymentHelpers";

// Strategy specific params
export type ImmediateExecutionStrategyParams = {
  signer: Signer;
};

// Implementation of Strategy.interface
// Send transactions one by one to the blockchain
// need to specify during construction:
// Signer - ethers.Signer connected to network
export class ImmediateExecutionStrategy implements Strategy {
  params: ImmediateExecutionStrategyParams;

  constructor(params_: ImmediateExecutionStrategyParams) {
    this.params = { signer: params_.signer };
  }

  async execute(txsToExecute: UnsignedTransaction[], params: ImmediateExecutionStrategyParams = this.params): Promise<ContractReceipt[]> {
    const signer = params.signer;
    const responses: ContractReceipt[] = [];
    while (txsToExecute.length > 0) {
      try {
        const tx: ContractTransaction = await signer.sendTransaction(txsToExecute.shift() as Deferrable<TransactionRequest>);
        const receipt = await printAndWaitOnTransaction(tx);
        responses.push(receipt);
      } catch (e) {
        console.log(e);
      }
    }
    return responses;
  }
}
