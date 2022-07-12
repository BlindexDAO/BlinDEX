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
  getVesting
} from "../utils/DeployedContractsHelpers";
import type { Contract } from "ethers";
import { SovrynSwapPriceFeed } from "../typechain/SovrynSwapPriceFeed";
import { FiatToFiatPseudoOracleFeed } from "../typechain/FiatToFiatPseudoOracleFeed";
import { getPools } from "../utils/UniswapPoolsHelpers";
import { PriceFeedContractNames } from "../utils/Constants";
import { printAndWaitOnTransaction } from "../utils/DeploymentHelpers";
import { getProxyAdminFactory } from "@openzeppelin/hardhat-upgrades/dist/utils/factories";

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

      owner = formatAddress(hre, owner);

      if (hre.network.name === "rsk") {
        const oracleEthUsd = (await hre.ethers.getContract(PriceFeedContractNames.ETH_USD, deployer)) as SovrynSwapPriceFeed;
        if (!(await isSameOwner(owner, oracleEthUsd))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.ETH_USD} to ${owner}`);
          await printAndWaitOnTransaction(await oracleEthUsd.transferOwnership(owner));
        }

        const oracleBtcEth = (await hre.ethers.getContract(PriceFeedContractNames.BTC_ETH, deployer)) as SovrynSwapPriceFeed;
        if (!(await isSameOwner(owner, oracleBtcEth))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.BTC_ETH} to ${owner}`);
          await printAndWaitOnTransaction(await oracleBtcEth.transferOwnership(owner));
        }

        const oracleEurUsd = (await hre.ethers.getContract(PriceFeedContractNames.EUR_USD, deployer)) as FiatToFiatPseudoOracleFeed;
        if (!(await isSameOwner(owner, oracleEurUsd))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.EUR_USD} to ${owner}`);
          await printAndWaitOnTransaction(await oracleEurUsd.transferOwnership(owner));
        }

        const oracleGbpUsd = (await hre.ethers.getContract(PriceFeedContractNames.GBP_USD, deployer)) as FiatToFiatPseudoOracleFeed;
        if (!(await isSameOwner(owner, oracleGbpUsd))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.GBP_USD} to ${owner}`);
          await printAndWaitOnTransaction(await oracleGbpUsd.transferOwnership(owner));
        }

        const oracleXauUsd = (await hre.ethers.getContract(PriceFeedContractNames.XAU_USD, deployer)) as FiatToFiatPseudoOracleFeed;
        if (!(await isSameOwner(owner, oracleXauUsd))) {
          console.log(`transfer ownership on contract ${PriceFeedContractNames.XAU_USD} to ${owner}`);
          await printAndWaitOnTransaction(await oracleXauUsd.transferOwnership(owner));
        }
      }

      const pools = await getPools(hre);
      for (const pool of pools) {
        const uniOracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        if (!(await isSameOwner(owner, uniOracle))) {
          console.log(`transfer ownership on uniswap pair oracle ${pool[0].name}-${pool[1].name} to ${owner}`);
          await printAndWaitOnTransaction(await uniOracle.transferOwnership(owner));
        }
      }

      const stables = await getAllBDStables(hre);
      for (const stable of stables) {
        if (!(await isSameOwner(owner, stable))) {
          console.log(`transfer ownership on BDStable ${await stable.name()} to ${owner}`);
          await printAndWaitOnTransaction(await stable.transferOwnership(owner));
        }
      }

      const stablePools = await getAllBDStablePools(hre);
      for (const stablePool of stablePools) {
        if (!(await isSameOwner(owner, stablePool))) {
          console.log(`transfer ownership on BDStablePool ${stablePool.address} to ${owner}`);
          await printAndWaitOnTransaction(await stablePool.transferOwnership(owner));
        }
      }

      const bdx = await getBdx(hre);
      if (!(await isSameOwner(owner, bdx))) {
        console.log(`transfer ownership on BDXShares ${bdx.address} to ${owner}`);
        await printAndWaitOnTransaction(await bdx.transferOwnership(owner));
      }

      const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
      if (!(await isSameOwner(owner, stakingRewardsDistribution))) {
        console.log(`transfer ownership on stakingRewardsDistribution contract ${stakingRewardsDistribution.address} to ${owner}`);
        await printAndWaitOnTransaction(await stakingRewardsDistribution.transferOwnership(owner));
      }

      const stakingRewards = await getAllBDStableStakingRewards(hre);
      for (const stakingReward of stakingRewards) {
        if (!(await isSameOwner(owner, stakingReward))) {
          console.log(`transfer ownership on stakingReward contract ${stakingReward.address} to ${owner}`);
          await printAndWaitOnTransaction(await stakingReward.transferOwnership(owner));
        }
      }

      const vesting = await getVesting(hre);
      if (!(await isSameOwner(owner, vesting))) {
        console.log(`transfer ownership on vesting contract ${vesting.address} to ${owner}`);
        await printAndWaitOnTransaction(await vesting.transferOwnership(owner));
      }
      const updater = await getBlindexUpdater(hre, deployer);

      if (!(await isSameOwner(owner, updater))) {
        console.log(`transfer ownership on updater ${updater.address} to ${owner}`);
        await printAndWaitOnTransaction(await updater.transferOwnership(owner));
      }

      const adminFactory = await getProxyAdminFactory(hre, deployer);
      const proxyAdminAddress = (await hre.ethers.getContract("DefaultProxyAdmin")).address;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = adminFactory.attach(proxyAdminAddress) as any;

      if (!(await isSameOwner(owner, admin))) {
        console.log(`Updating DefaultProxyAdmin to the new owner: ${owner}`);
        await printAndWaitOnTransaction(await admin.transferOwnership(owner));
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
      treasury = formatAddress(hre, treasury);
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
}
