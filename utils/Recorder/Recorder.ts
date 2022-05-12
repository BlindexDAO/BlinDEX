import { ContractReceipt, UnsignedTransaction } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getDeployer, getTimelock } from "../DeployedContractsHelpers";
import { Strategy } from "./strategies/Strategy.interface";
import { TimelockStrategy } from "./strategies/TimelockStrategy";
import { OneByOneStrategy } from "./strategies/OneByOneStrategy";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";

// class responsible for recoding and executing transactions
// construction:
// strategy - that will be used to execute transactions
export class Recorder {
  recordedTransactions: UnsignedTransaction[] = [];
  executedTransactions: ContractReceipt[] = [];
  strategy: Strategy;

  constructor(_strategy: Strategy) {
    this.strategy = _strategy;
  }

  // pushes an unsigned transaction (the parameter) to the recordedTransaction List
  record(transaction: UnsignedTransaction) {
    this.recordedTransactions.push(transaction);
  }

  // execute all recorderTransaction in order using strategy and clears recordedTransaction
  async execute(): Promise<ContractReceipt[]> {
    const transactionsToExecuteCount = this.recordedTransactions.length;

    const response = await this.strategy.execute(this.recordedTransactions);
    this.recordedTransactions = [];
    this.executedTransactions.concat(response);

    console.log(`${transactionsToExecuteCount} transactions were executed`);
    return response;
  }

  print() {
    console.log(this.recordedTransactions);
  }
}

type DefaultRecorderParams = {
  executionStartInDays: number | null;
  singer: SignerWithAddress | null;
};

export async function defaultRecorder(hre: HardhatRuntimeEnvironment, params: DefaultRecorderParams | null = null) {
  if (hre.network.name === "mainnetFork") {
    return new Recorder(
      new OneByOneStrategy({
        signer: params?.singer ?? (await getDeployer(hre))
      })
    );
  } else {
    return defaultTimelockRecorder(hre, params);
  }
}

export async function defaultTimelockRecorder(hre: HardhatRuntimeEnvironment, params: DefaultRecorderParams | null = null) {
  const blockBefore = await hre.ethers.provider.getBlock("latest");
  const timestamp = blockBefore.timestamp;

  const days = params?.executionStartInDays ?? 14; //todo ag default

  const secondsInDay = 60 * 60 * 24;
  const eta = timestamp + days * secondsInDay + 100; //todo ag 100 is sketchy

  const timelockRecorder = new Recorder(
    new TimelockStrategy({
      timelock: await getTimelock(hre),
      eta: eta
    })
  );

  return timelockRecorder;
}
