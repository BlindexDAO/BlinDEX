import { task } from "hardhat/config";
import {
  getAllBDStablePools,
  getAllBDStables,
  getAllBDStableStakingRewards,
  getBdx,
  getDeployer,
  getStakingRewardsDistribution,
  getUniswapPairOracle,
  getUpdater,
  getVesting
} from "../utils/DeployedContractsHelpers";
import type { Contract } from "ethers";
import { SovrynSwapPriceFeed } from "../typechain/SovrynSwapPriceFeed";
import { FiatToFiatPseudoOracleFeed } from "../typechain/FiatToFiatPseudoOracleFeed";
import { getPools } from "../utils/UniswapPoolsHelpers";
import { PriceFeedContractNames } from "../utils/Constants";

export function load() {
  async function isSameOwner(owner: string, contract: Contract): Promise<boolean> {
    const currentOwner = await contract.owner();
    return currentOwner.toLowerCase() === owner.toLowerCase();
  }

  task("users:owner:set")
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
      const updater = await getUpdater(hre);
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

      const networkName = hre.network.name;
      const deployer = await getDeployer(hre);
      const oracleEthUsd = (await hre.ethers.getContract(PriceFeedContractNames.ETH_USD, deployer)) as SovrynSwapPriceFeed;
      const oracleBtcEth = (await hre.ethers.getContract(PriceFeedContractNames.BTC_ETH, deployer)) as SovrynSwapPriceFeed;
      const oracleEurUsd = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD, deployer)) as FiatToFiatPseudoOracleFeed;
      const oracleGbpUsd = (await hre.ethers.getContract(PriceFeedContractNames.GBP_USD, deployer)) as FiatToFiatPseudoOracleFeed;
      const oracleXauUsd = (await hre.ethers.getContract(PriceFeedContractNames.XAU_USD, deployer)) as FiatToFiatPseudoOracleFeed;

      if (networkName === "rsk") {
        await (await oracleEthUsd.setUpdater(newUpdater)).wait();
        console.log("updated oracleEthUsd");

        await (await oracleBtcEth.setUpdater(newUpdater)).wait();
        console.log("updated oracleBtcEth");

        await (await oracleEurUsd.setUpdater(newUpdater)).wait();
        console.log("updated oracleEurUsd");

        await (await oracleGbpUsd.setUpdater(newUpdater)).wait();
        console.log("updated oracleGbpUsd");

        await (await oracleXauUsd.setUpdater(newUpdater)).wait();
        console.log("updated oracleXauUsd");
      }

      console.log("updaters set");
    });

  async function isSameTreasury(treasury: string, contract: Contract): Promise<boolean> {
    const currentTreasury = await contract.treasury();
    return currentTreasury.toLowerCase() === treasury.toLowerCase();
  }

  task("users:treasury:set")
    .addPositionalParam("treasury", "new treasury address")
    .setAction(async ({ treasury }, hre) => {
      console.log(`Setting the new treasury '${treasury}' on ${hre.network.name}`);

      const stables = await getAllBDStables(hre);

      for (const stable of stables) {
        if (!(await isSameTreasury(treasury, stable))) {
          await (await stable.setTreasury(treasury)).wait();
          console.log(`${await stable.symbol()} treasury set to ${treasury}`);
        }
      }

      const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
      if (!(await isSameTreasury(treasury, stakingRewardsDistribution))) {
        await (await stakingRewardsDistribution.setTreasury(treasury)).wait();
        console.log(`StakingRewardsDistribution treasury set to ${treasury}`);
      }
    });

  // TODO: Delete this once we removed the operational treasury
  task("users:operational-treasury:set")
    .addPositionalParam("operationalTreasury", "new operational treasury address")
    .setAction(async ({ operationalTreasury }, hre) => {
      console.log(`Setting the new operational treasury '${operationalTreasury}' on ${hre.network.name}`);

      const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
      if (!(await isSameTreasury(operationalTreasury, stakingRewardsDistribution))) {
        await (await stakingRewardsDistribution.setTreasury(operationalTreasury)).wait();
        console.log(`StakingRewardsDistribution operational treasury set to ${operationalTreasury}`);
      }
    });
}
