import { ContractReceipt, ContractTransaction, Signer } from "ethers";
import { Strategy } from "./Strategy.interface";
import { UnsignedTransaction } from "ethers";
import { Deferrable } from "ethers/lib/utils";
import { TransactionRequest } from "@ethersproject/abstract-provider";

//Strategy specific params
export type OneByOneStrategyParams = {
  signer: Signer;
};

// Implementation of Strategy.interface
// Send transactions ony by one to the blockchain
// need to specify during construction:
// Signer - ethers.Signer connected to network
export class OneByOneStrategy implements Strategy {
  params: OneByOneStrategyParams;

  constructor(params_: OneByOneStrategyParams) {
    this.params = { signer: params_.signer };
  }

  async execute(txsToExecute: UnsignedTransaction[], params: OneByOneStrategyParams = this.params): Promise<ContractReceipt[]> {
    const signer = params.signer;
    const responses: ContractReceipt[] = [];
    while (txsToExecute.length > 0) {
      const tx: ContractTransaction = await signer.sendTransaction(txsToExecute.shift() as Deferrable<TransactionRequest>);
      const receipt: ContractReceipt = await tx.wait();
      responses.push(receipt);
    }
    return responses;
  }
}
