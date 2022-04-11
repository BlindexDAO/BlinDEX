import Safe from "@gnosis.pm/safe-core-sdk";
import { UnsignedTransaction } from "ethers";
import { Strategy } from "./Strategy.interface";
import SafeServiceClient from "@gnosis.pm/safe-service-client";
import { MetaTransactionData } from "@gnosis.pm/safe-core-sdk-types";

//Strategy-specific parameters
export type GnosisMultisendStrategyParams = {
  safeSdk: Safe;
  safeServiceClient: SafeServiceClient;
  safeAddress: string;
  senderAddress: string;
};

// Implementation of Strategy.interface
// Batches all transactions and sends them as one to the gnosisSafe
// need to specify during construction:
// safeSdk - gnosisSafe interface
// SafeServiceClient - example : "https://safe-transaction.gnosis.io" mainnet address
// safeAddress - safe Address on blockchain
// senderAddress- sender adress (public key)
export class GnosisMultisendStrategy implements Strategy {
  params: GnosisMultisendStrategyParams;

  constructor(params: GnosisMultisendStrategyParams) {
    this.params = {
      safeSdk: params.safeSdk,
      safeServiceClient: params.safeServiceClient,
      safeAddress: params.safeAddress,
      senderAddress: params.senderAddress
    };
  }
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  async strategyFunction(txsToExecute: UnsignedTransaction[], params: GnosisMultisendStrategyParams = this.params): Promise<undefined[]> {
    const transactions: MetaTransactionData[] = [];

    for (let i = 0; i < txsToExecute.length; i++) {
      if (typeof txsToExecute[i].to !== "string") throw "transaction to is not defined";
      transactions.push({
        to: txsToExecute[i].to as unknown as string,
        value: "0",
        data: txsToExecute[i].data as string
      });
    }

    const safeTransaction = await params.safeSdk.createTransaction(transactions, {});
    await params.safeSdk.signTransaction(safeTransaction);
    const safeTxHash = await params.safeSdk.getTransactionHash(safeTransaction);
    await params.safeServiceClient.proposeTransaction({
      safeAddress: params.safeAddress,
      safeTransaction: safeTransaction,
      safeTxHash: safeTxHash,
      senderAddress: params.senderAddress
    });
    return [];
  }
}
