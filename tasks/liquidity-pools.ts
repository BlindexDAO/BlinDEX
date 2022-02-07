import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { formatAddress, getAllUniswaPairs, getBdx, getOperationalTreasury, getTokenData, getUniswapFactory } from "../utils/DeployedContractsHelpers";
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

  task("lp:all:show:feeTo", "Shows the 'feeTo' address set on the Uniswap Factory").setAction(async (_args, hre) => {
    const factory = await getUniswapFactory(hre);
    console.log("Current 'feeTo' address:", await factory.feeTo());
  });

  task("lp:all:show", "Showing information for all the liquidity pools in the system").setAction(async (_args, hre) =>
    console.log(getAllUniswapPairsData(hre))
  );
}

export async function getAllUniswapPairsData(hre: HardhatRuntimeEnvironment, onlyWhitelistedTokens = false) {
  const pairs = await getAllUniswaPairs(hre, onlyWhitelistedTokens);
  const bdxAddress = formatAddress(hre, (await getBdx(hre)).address);

  const fullData = await Promise.all(
    pairs.map(async pair => {
      const [reserves, token0, token1] = await Promise.all([pair.getReserves(), pair.token0(), pair.token1()]);
      const [token0Data, token1Data] = await Promise.all([getTokenData(token0, hre), getTokenData(token1, hre)]);

      return {
        pairName: `${token0Data.symbol}_${token1Data.symbol}`,
        address: pair.address,
        isBdxPool: bdxAddress === formatAddress(hre, token0) || bdxAddress === formatAddress(hre, token1),
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

  return fullData;
}
