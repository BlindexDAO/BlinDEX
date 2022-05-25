import { task } from "hardhat/config";
import {
  formatAddress,
  getAllBDStablePools,
  getAllBDStables,
  getAllBDStableStakingRewards,
  getBdx,
  getDeployer,
  getStakingRewardsDistribution,
  getUniswapPairOracle,
  getBlindexUpdater,
  getVesting,
  getAllBdStables,
  getTimelock,
  getProposer
} from "../utils/DeployedContractsHelpers";
import type { Contract } from "ethers";
import { SovrynSwapPriceFeed } from "../typechain/SovrynSwapPriceFeed";
import { FiatToFiatPseudoOracleFeed } from "../typechain/FiatToFiatPseudoOracleFeed";
import { getPools } from "../utils/UniswapPoolsHelpers";
import { PriceFeedContractNames } from "../utils/Constants";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { extractTimelockQueuedTransactionsBatchParamsDataAndHash, extractTxParamsHashAndTxHashFromSingleTransaction } from "../utils/TimelockHelpers";
import { defaultRecorder, defaultTimelockRecorder } from "../utils/Recorder/Recorder";
import { toRc } from "../utils/Recorder/RecordableContract";
import { Ownable } from "../typechain";

export function load() {
  task("users:change-owner-to-timelock").setAction(async (args, hre) => {
    const timelock = await getTimelock(hre);
    const deployer = await getDeployer(hre);

    const contracts = await getContractsToTransferOwnership(hre);

    for (const contract of contracts) {
      await (await contract.connect(deployer).transferOwnership(timelock.address)).wait();
    }

    console.log("owner changed to timelock");
  });

  task("users:queue-change-owner-to-deployer").setAction(async (args_, hre) => {
    const contracts = await getContractsToTransferOwnership(hre);

    const deployer = await getDeployer(hre);
    const proposer = await getProposer(hre);

    const recorder = await defaultTimelockRecorder(hre, { executionStartInDays: null, singer: proposer });

    for (const contract of contracts) {
      await toRc(contract, recorder).record.transferOwnership(deployer.address);
    }

    const receipt = await recorder.execute();
    const { txParamsHash, txHash } = extractTxParamsHashAndTxHashFromSingleTransaction(receipt, "QueuedTransactionsBatch");
    const { txParamsData } = await extractTimelockQueuedTransactionsBatchParamsDataAndHash(hre, txHash);

    console.log("txParamsData:", txParamsData);
    console.log("txParamsHash:", txParamsHash);
    console.log("txHash:", txHash);
  });

  async function getContractsToTransferOwnership(hre: HardhatRuntimeEnvironment): Promise<Ownable[]> {
    const contracts: Ownable[] = [];

    const pools = await getPools(hre);

    for (const pool of pools) {
      const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
      contracts.push(oracle);
    }

    const bdx = await getBdx(hre);

    const stables = await getAllBdStables(hre);
    const stablePools = await getAllBDStablePools(hre);

    const srd = await getStakingRewardsDistribution(hre);
    const stakingRewards = await getAllBDStableStakingRewards(hre);

    const vesting = await getVesting(hre);

    const updater = await getBlindexUpdater(hre, undefined);

    if (hre.network.name === "rsk") {
      const oracleEthUsd = (await hre.ethers.getContract(PriceFeedContractNames.ETH_USD)) as SovrynSwapPriceFeed;
      const oracleBtcEth = (await hre.ethers.getContract(PriceFeedContractNames.BTC_ETH)) as SovrynSwapPriceFeed;
      const oracleEurUsd = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD)) as FiatToFiatPseudoOracleFeed;
      const oracleGbpUsd = (await hre.ethers.getContract(PriceFeedContractNames.GBP_USD)) as FiatToFiatPseudoOracleFeed;
      const oracleXauUsd = (await hre.ethers.getContract(PriceFeedContractNames.XAU_USD)) as FiatToFiatPseudoOracleFeed;

      const oracles = [oracleEthUsd, oracleBtcEth, oracleEurUsd, oracleGbpUsd, oracleXauUsd];

      contracts.push(...oracles);
    }

    contracts.push(bdx, ...stables, ...stablePools, ...stakingRewards, srd, vesting, updater);

    return contracts;
  }

  task("users:updater:set")
    .addPositionalParam("newUpdater", "new updater address")
    .setAction(async ({ newUpdater }, hre) => {
      console.log("starting the setUpdaters to:", newUpdater);

      const deployer = await getDeployer(hre);
      const oracleEthUsd = (await hre.ethers.getContract(PriceFeedContractNames.ETH_USD, deployer)) as SovrynSwapPriceFeed;
      const oracleBtcEth = (await hre.ethers.getContract(PriceFeedContractNames.BTC_ETH, deployer)) as SovrynSwapPriceFeed;
      const oracleEurUsd = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD, deployer)) as FiatToFiatPseudoOracleFeed;
      const oracleGbpUsd = (await hre.ethers.getContract(PriceFeedContractNames.GBP_USD, deployer)) as FiatToFiatPseudoOracleFeed;
      const oracleXauUsd = (await hre.ethers.getContract(PriceFeedContractNames.XAU_USD, deployer)) as FiatToFiatPseudoOracleFeed;

      const recorder = await defaultRecorder(hre);

      const contracts = [oracleEthUsd, oracleBtcEth, oracleEurUsd, oracleGbpUsd, oracleXauUsd];

      for (const contract of contracts) {
        const contractRecordable = toRc(contract, recorder);

        await contractRecordable.record.setUpdater(newUpdater);
      }

      await recorder.execute();
    });

  async function isSameTreasury(treasury: string, contract: Contract): Promise<boolean> {
    const currentTreasury = await contract.treasury();
    return currentTreasury.toLowerCase() === treasury.toLowerCase();
  }

  task("users:treasury:set")
    .addPositionalParam("treasury", "new treasury address")
    .setAction(async ({ treasury }, hre) => {
      treasury = formatAddress(hre, treasury);
      console.log(`Setting the new treasury '${treasury}' on ${hre.network.name}`);

      const stables = await getAllBDStables(hre);
      const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);

      const contracts = [...stables, stakingRewardsDistribution];

      const recorder = await defaultRecorder(hre);

      for (const contract of contracts) {
        const contractRecordable = toRc(contract, recorder);

        if (!(await isSameTreasury(treasury, contractRecordable))) {
          await contractRecordable.record.setTreasury(treasury);
        }
      }

      await recorder.execute();
    });
}
