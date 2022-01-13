import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { BDXShares } from "../typechain/BDXShares";
import * as constants from "../utils/Constants";
import { getAllUniswaPairs, getBdx, getERC20, getOperationalTreasury, getUniswapFactory } from "../utils/DeployedContractsHelpers";
import { bigNumberToDecimal } from "../utils/NumbersHelpers";

export function load() {
  task("lp:all:set:feeTo-OperationalTreasury", "Setting the Uniswap V2 factory 'feeTo' address to the operational treasury").setAction(
    async (_args, hre) => {
      const operationalTreasury = await getOperationalTreasury(hre);
      const factory = await getUniswapFactory(hre);

      console.log("Current 'feeTo' address:", await factory.feeTo());
      console.log(`Setting the 'feeTo' address to: ${operationalTreasury.address}`);
      await (await factory.setFeeTo(operationalTreasury.address)).wait();
      console.log("'feeTo' address after the change:", await factory.feeTo());
    }
  );

  task("lp:all:show", "Showing information for all the liquidity pools in the system").setAction(async (_args, hre) => {
    async function getTokenData(tokenAddress: string, bdx: BDXShares, hre: HardhatRuntimeEnvironment): Promise<{ symbol: string; decimals: number }> {
      if (tokenAddress === bdx.address) {
        const [symbol, decimals] = await Promise.all([bdx.symbol(), bdx.decimals()]);
        return {
          symbol,
          decimals
        };
      } else if (tokenAddress === constants.wETH_address[hre.network.name]) {
        return {
          symbol: constants.NATIVE_TOKEN_NAME[hre.network.name],
          decimals: constants.wETH_precision[hre.network.name]
        };
      } else if (tokenAddress === constants.wBTC_address[hre.network.name]) {
        return {
          symbol: constants.SECONDARY_COLLATERAL_TOKEN_NAME[hre.network.name],
          decimals: constants.wBTC_precision[hre.network.name]
        };
      } else {
        const token = await getERC20(hre, tokenAddress);
        const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
        return {
          symbol,
          decimals
        };
      }
    }

    const [pairs, bdx] = await Promise.all([getAllUniswaPairs(hre), getBdx(hre)]);

    const fullData = await Promise.all(
      pairs.map(async pair => {
        const [reserves, token0, token1] = await Promise.all([pair.getReserves(), pair.token0(), pair.token1()]);
        const [token0Data, token1Data] = await Promise.all([getTokenData(token0, bdx, hre), getTokenData(token1, bdx, hre)]);

        return {
          pairName: `${token0Data.symbol}_${token1Data.symbol}`,
          address: pair.address,
          [token0Data.symbol]: {
            address: token0,
            decimals: token0Data.decimals,
            reserves: bigNumberToDecimal(reserves._reserve0, token0Data.decimals)
          },
          [token1Data.symbol]: {
            address: token1,
            decimals: token1Data.decimals,
            reserves: bigNumberToDecimal(reserves._reserve1, token1Data.decimals)
          }
        };
      })
    );

    console.log(fullData);
  });
}
