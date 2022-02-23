import { task } from "hardhat/config";
import { getAllBDStableStakingRewards, getDeployer, getTreasury, mintWbtc, mintWeth } from "../utils/DeployedContractsHelpers";
import { to_d18, to_d8 } from "../utils/NumbersHelpers";
import { getUsdcFor } from "../utils/LocalHelpers";
import { setupProductionReadySystem } from "../utils/SystemSetup";
import { types } from "hardhat/config";

export function load() {
  task("initialize")
    .addParam("btceur", "initial btc/eur Price")
    .addParam("bdxeur", "initial bdx/eur Price")
    .addParam("etheur", "initial eth/eur Price")
    .addParam("ethusd", "initial eth/usd Price")
    .addParam("btcusd", "initial btc/usd Price")
    .addParam("bdxusd", "initial bdx/usd Price")
    .addParam("usdeur", "initial usd/eur Price")
    .setAction(async ({ btceur, bdxeur, etheur, ethusd, btcusd, bdxusd, usdeur }, hre) => {
      await setupProductionReadySystem(hre, btceur, btcusd, bdxeur, bdxusd, etheur, ethusd, usdeur);
    });

  task("initialize:local")
    .addOptionalParam("btcEur", "initial btc/eur Price", 50353, types.float)
    .addOptionalParam("bdxEur", "initial bdx/eur Price", 0.89, types.float)
    .addOptionalParam("ethEur", "initial eth/eur Price", 3900, types.float)
    .addOptionalParam("ethUsd", "initial eth/usd Price", 4000, types.float)
    .addOptionalParam("btcUsd", "initial btc/usd Price", 57000, types.float)
    .addOptionalParam("bdxUsd", "initial bdx/usd Price", 1, types.float)
    .addOptionalParam("usdEur", "initial usd/eur Price", 0.88, types.float)
    .setAction(async ({ btcEur, bdxEur, ethEur, ethUsd, btcUsd, bdxUsd, usdEur }, hre) => {
      if (hre.network.name !== "mainnetFork") {
        throw new Error("Local only task");
      }

      const deployer = await getDeployer(hre);
      const treasury = await getTreasury(hre);

      // mint initial WETH
      await mintWeth(hre, deployer, to_d18(100));

      // mint inital WBTC
      await mintWbtc(hre, deployer, to_d8(10), 1000);

      // mint initial WETH
      await mintWeth(hre, treasury, to_d18(100));

      // mint inital WBTC
      await mintWbtc(hre, treasury, to_d8(10), 1000);

      await getUsdcFor(hre, treasury.address, 1000);

      await setupProductionReadySystem(hre, btcEur, btcUsd, bdxEur, bdxUsd, ethEur, ethUsd, usdEur);

      // soft launch simulation
      const stakings = await getAllBDStableStakingRewards(hre);
      for (const staking of stakings) {
        await staking.unpause();
      }
    });
}
