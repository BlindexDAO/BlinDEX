import { ContractReceipt, UnsignedTransaction } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getDeployer, getProposer, getTimelock } from "../DeployedContractsHelpers";
import { Strategy } from "./strategies/Strategy.interface";
import { TimelockStrategy } from "./strategies/TimelockStrategy";
import { ImmediateExecutionStrategy } from "./strategies/ImmediateExecutionStrategy";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";
import { blockTimeSeconds } from "../Constants";
import { Signer } from "ethers";
import { mineBlock } from "../HelpersHardhat";

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

    console.log(`${transactionsToExecuteCount} transactions were queued/executed`);
    return response;
  }

  print() {
    console.log(this.recordedTransactions);
  }
}

type DefaultRecorderParams = {
  executionStartInDays: number | null;
  signer: SignerWithAddress | null;
};

export async function defaultRecorder(hre: HardhatRuntimeEnvironment, params: DefaultRecorderParams | null = null) {
  // todo ag replace when timelock is deployed
  return new Recorder(
    new ImmediateExecutionStrategy({
      signer: params?.singer ?? (await getDeployer(hre))
    })
  );

  // if ([chainNames.mainnetFork, chainNames.arbitrumTestnet, chainNames.goerli, chainNames.kovan].includes(hre.network.name)) {
  //   return new Recorder(
  //     new ImmediateExecutionStrategy({
  //       signer: params?.singer ?? (await getDeployer(hre))
  //     })
  //   );
  // } else {
  //   return defaultTimelockRecorder(hre, params);
  // }
}

export async function defaultTimelockRecorder(hre: HardhatRuntimeEnvironment, params?: DefaultRecorderParams) {
  if (hre.network.name === "mainnetFork") {
    // on local env blocks are mined non-deterministically
    // we need to mine the block right before we queue a timelock transaction
    // to make sure we fit into the minimum delay window
    await mineBlock();
  }

  const blockBefore = await hre.ethers.provider.getBlock("latest");
  const timestamp = blockBefore.timestamp;

  // the default use of the timlock recorder is to queue the transactions
  // be default they will be executed by the multisig
  // if we want to execute the approved transactions batch from terminal we should specify the signer explicitly (the executor)
  const signer = params?.signer ?? (await getProposer(hre));

  const timelock = (await getTimelock(hre)).connect(signer);

  const validBlockMargin = blockTimeSeconds[hre.network.name] * 2; // 2 blocks just in case

  let eta: number;
  if (params?.executionStartInDays) {
    const secondsInDay = 60 * 60 * 24;
    eta = timestamp + params?.executionStartInDays * secondsInDay + validBlockMargin;
  } else {
    eta = timestamp + Number(await timelock.minimumExecutionDelay()) + validBlockMargin;
  }

  const timelockRecorder = new Recorder(
    new TimelockStrategy({
      timelock: timelock,
      eta: eta
    })
  );

  return timelockRecorder;
}

export function defaultImmediateExecutionRecorder(signer: Signer) {
  return new Recorder(new ImmediateExecutionStrategy({ signer: signer }));
}
