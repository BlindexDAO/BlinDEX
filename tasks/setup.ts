import { task } from "hardhat/config";
import { getAllBDStableStakingRewards, getDeployer, getTreasury, mintWbtc, mintWeth } from "../utils/DeployedContractsHelpers";
import { to_d18, to_d8 } from "../utils/NumbersHelpers";
import { getDaiFor, getUsdcFor } from "../utils/LocalHelpers";
import { CollateralPrices, setupLocalSystem, setupProductionReadySystem } from "../utils/SystemSetup";
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
    .addParam("btcxau", "initial btc/xau Price")
    .addParam("ethxau", "initial eth/xau Price")
    .addParam("btcgbp", "initial btc/gbp Price")
    .addParam("ethgbp", "initial eth/gbp Price")
    .addParam("bdxxau", "initial bdx/xau Price")
    .addParam("bdxgbp", "initial bdx/gbp Price")
    .setAction(async ({ btceur, bdxeur, etheur, ethusd, btcusd, bdxusd, usdeur, btcxau, ethxau, btcgbp, ethgbp, bdxxau, bdxgbp }, hre) => {
      const initialCollateralPrice: CollateralPrices = {
        NativeToken: {
          USD: ethusd,
          EUR: etheur,
          XAU: ethxau,
          GBP: ethgbp
        },
        SecondaryCollateralToken: {
          USD: btcusd,
          EUR: btceur,
          XAU: btcxau,
          GBP: btcgbp
        }
      };
      await setupProductionReadySystem(hre, bdxeur, bdxusd, bdxxau, bdxgbp, usdeur, initialCollateralPrice);
    });

  task("initialize:local")
    .addOptionalParam("btcEur", "initial btc/eur Price", 50353, types.float)
    .addOptionalParam("bdxEur", "initial bdx/eur Price", 0.89, types.float)
    .addOptionalParam("ethEur", "initial eth/eur Price", 3900, types.float)
    .addOptionalParam("ethUsd", "initial eth/usd Price", 4000, types.float)
    .addOptionalParam("btcUsd", "initial btc/usd Price", 57000, types.float)
    .addOptionalParam("bdxUsd", "initial bdx/usd Price", 1, types.float)
    .addOptionalParam("usdEur", "initial usd/eur Price", 0.88, types.float)
    .addOptionalParam("btcXau", "initial btc/xau Price", 29, types.float)
    .addOptionalParam("ethXau", "initial eth/xau Price", 2.1, types.float)
    .addOptionalParam("btcGbp", "initial btc/gbp Price", 52000, types.float)
    .addOptionalParam("ethGbp", "initial eth/gbp Price", 0.95, types.float)
    .addOptionalParam("bdxXau", "initial bdx/xau Price", 0.00051, types.float)
    .addOptionalParam("bdxGbp", "initial bdx/gbp Price", 0.75, types.float)
    .setAction(async ({ btcEur, bdxEur, ethEur, ethUsd, btcUsd, bdxUsd, usdEur, btcXau, ethXau, btcGbp, ethGbp, bdxXau, bdxGbp }, hre) => {
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
      await getDaiFor(hre, treasury.address, 1000);

      const initialCollateralPrice: CollateralPrices = {
        NativeToken: {
          USD: ethUsd,
          EUR: ethEur,
          XAU: ethXau,
          GBP: ethGbp
        },
        SecondaryCollateralToken: {
          USD: btcUsd,
          EUR: btcEur,
          XAU: btcXau,
          GBP: btcGbp
        }
      };
      await setupLocalSystem(hre, bdxEur, bdxUsd, bdxXau, bdxGbp, usdEur, initialCollateralPrice);

      // soft launch simulation
      const stakings = await getAllBDStableStakingRewards(hre);
      for (const staking of stakings) {
        if (await staking.paused()) {
          await staking.unpause();
        }
      }
    });
}
