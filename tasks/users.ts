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
  getTimelock
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

export function load() {
  async function isSameOwner(owner: string, contract: Contract): Promise<boolean> {
    const currentOwner = await contract.owner();
    return currentOwner.toLowerCase() === owner.toLowerCase();
  }

  task("change-owner-to-timelock").setAction(async (args, hre) => {
    const timelock = await getTimelock(hre);
    const deployer = await getDeployer(hre);

    const contracts = await getContractsToTransferOwnership(hre);

    for (const contract of contracts) {
      await (await contract.connect(deployer).transferOwnership(timelock.address)).wait();
    }

    console.log("owner changed to timelock");
  });

  task("queue-change-owner-to-deployer").setAction(async (args_, hre) => {
    const contracts = await getContractsToTransferOwnership(hre);

    const deployer = await getDeployer(hre);
    const recorder = await defaultTimelockRecorder(hre, { executionStartInDays: null, singer: deployer });

    for (const contract of contracts) {
      await toRc(contract, recorder).record.transferOwnership(deployer.address);
    }

    const receipt = await recorder.execute();
    const { txParamsHash, txHash } = extractTxParamsHashAndTxHashFromSingleTransaction(receipt, "QueuedTransactionsBatch");
    const { txParamsData } = await extractTimelockQueuedTransactionsBatchParamsDataAndHash(hre, txHash);

    console.log("txHash:", txHash);
    console.log("txParamsHash:", txParamsHash);
    console.log("txParamsData:", txParamsData);
  });

  async function getContractsToTransferOwnership(hre: HardhatRuntimeEnvironment) {
    //todo ag change for every Ownable or OwnableUpgradeable

    const contracts = [];

    const pools = await getPools(hre);

    for (const pool of pools) {
      const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
      contracts.push(oracle);
    }

    const stables = await getAllBdStables(hre);
    const stablePools = await getAllBDStablePools(hre);

    const srd = await getStakingRewardsDistribution(hre);
    const stakings = await getAllBDStableStakingRewards(hre);

    contracts.push(...stables, ...stablePools, ...stakings, srd);

    return contracts;
  }

  task("users:owner:set") //todo ag
    .addPositionalParam("owner", "owner address")
    .setAction(async ({ owner }, hre) => {
      console.log(`set:owner ${owner} on ${hre.network.name}`);
      const deployer = await getDeployer(hre);
      if (hre.network.name === "rsk") {
        const oracleEthUsd = (await hre.ethers.getContract(PriceFeedContractNames.ETH_USD, deployer)) as SovrynSwapPriceFeed;
        if (!(await isSameOwner(owner, oracleEthUsd))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.ETH_USD} to ${owner}`);
          await (await oracleEthUsd.transferOwnership(owner)).wait();
        }

        const oracleBtcEth = (await hre.ethers.getContract(PriceFeedContractNames.BTC_ETH, deployer)) as SovrynSwapPriceFeed;
        if (!(await isSameOwner(owner, oracleBtcEth))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.BTC_ETH} to ${owner}`);
          await (await oracleBtcEth.transferOwnership(owner)).wait();
        }

        const oracleEurUsd = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD, deployer)) as FiatToFiatPseudoOracleFeed;
        if (!(await isSameOwner(owner, oracleEurUsd))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.EUR_USD} to ${owner}`);
          await (await oracleEurUsd.transferOwnership(owner)).wait();
        }

        const oracleGbpUsd = (await hre.ethers.getContract(PriceFeedContractNames.GBP_USD, deployer)) as FiatToFiatPseudoOracleFeed;
        if (!(await isSameOwner(owner, oracleGbpUsd))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.GBP_USD} to ${owner}`);
          await (await oracleGbpUsd.transferOwnership(owner)).wait();
        }

        const oracleXauUsd = (await hre.ethers.getContract(PriceFeedContractNames.XAU_USD, deployer)) as FiatToFiatPseudoOracleFeed;
        if (!(await isSameOwner(owner, oracleXauUsd))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.XAU_USD} to ${owner}`);
          await (await oracleXauUsd.transferOwnership(owner)).wait();
        }
      }

      const pools = await getPools(hre);
      for (const pool of pools) {
        const uniOracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        if (!(await isSameOwner(owner, uniOracle))) {
          console.log(`transfer ownership on uniswap pair oracle ${pool[0].name}-${pool[1].name} to ${owner}`);
          await (await uniOracle.transferOwnership(owner)).wait();
        }
      }

      const stables = await getAllBDStables(hre);
      for (const stable of stables) {
        if (!(await isSameOwner(owner, stable))) {
          console.log(`transfer ownership on BDStable ${await stable.name()} to ${owner}`);
          await (await stable.transferOwnership(owner)).wait();
        }
      }

      const stablePools = await getAllBDStablePools(hre);
      for (const stablePool of stablePools) {
        if (!(await isSameOwner(owner, stablePool))) {
          console.log(`transfer ownership on BDStablePool ${stablePool.address} to ${owner}`);
          await (await stablePool.transferOwnership(owner)).wait();
        }
      }

      const bdx = await getBdx(hre);
      if (!(await isSameOwner(owner, bdx))) {
        console.log(`transfer ownership on BDXShares ${bdx.address} to ${owner}`);
        await (await bdx.transferOwnership(owner)).wait();
      }

      const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
      if (!(await isSameOwner(owner, stakingRewardsDistribution))) {
        console.log(`transfer ownership on stakingRewardsDistribution contract ${stakingRewardsDistribution.address} to ${owner}`);
        await (await stakingRewardsDistribution.transferOwnership(owner)).wait();
      }

      const stakingRewards = await getAllBDStableStakingRewards(hre);
      for (const stakingReward of stakingRewards) {
        if (!(await isSameOwner(owner, stakingReward))) {
          console.log(`transfer ownership on stakingReward contract ${stakingReward.address} to ${owner}`);
          await (await stakingReward.transferOwnership(owner)).wait();
        }
      }

      const vesting = await getVesting(hre);
      if (!(await isSameOwner(owner, vesting))) {
        console.log(`transfer ownership on vesting contract ${vesting.address} to ${owner}`);
        await (await vesting.transferOwnership(owner)).wait();
      }
      const updater = await getBlindexUpdater(hre, deployer);

      if (!(await isSameOwner(owner, updater))) {
        console.log(`transfer ownership on updater ${updater.address} to ${owner}`);
        await (await updater.transferOwnership(owner)).wait();
      }

      console.log(`All ownership transfered to ${owner}`);
    });

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
