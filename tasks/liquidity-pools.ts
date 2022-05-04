import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { multisigTreasuryAddress } from "../utils/Constants";
import { formatAddress, getAllUniswapPairs, getBdx, getTokenData, getTreasury, getUniswapFactory } from "../utils/DeployedContractsHelpers";
import { bigNumberToDecimal } from "../utils/NumbersHelpers";

export function load() {
  task("lp:all:set:feeTo-Treasury", "Setting the Uniswap V2 factory 'feeTo' address to the treasury").setAction(async (_args, hre) => {
    const networkName = hre.network.name;

    if (!["rsk", "mainnetFork"].includes(networkName.toLocaleLowerCase())) {
      throw new Error("Chain not supported for this operation");
    }

    const treasuryAddress = hre.network.name.toLocaleLowerCase() === "rsk" ? multisigTreasuryAddress[networkName] : (await getTreasury(hre)).address;
    const factory = await getUniswapFactory(hre);

    console.log("Current 'feeTo' address:", await factory.feeTo());
    console.log(`Setting the 'feeTo' address to: ${treasuryAddress}`);
    await (await factory.setFeeTo(treasuryAddress)).wait();
    console.log("'feeTo' address after the change:", await factory.feeTo());
  });

  task("lp:all:show:feeTo", "Shows the 'feeTo' address set on the Uniswap Factory").setAction(async (_args, hre) => {
    const factory = await getUniswapFactory(hre);
    console.log("Current 'feeTo' address:", await factory.feeTo());
  });

  task("lp:all:show", "Showing information for all the liquidity pools in the system").setAction(async (_args, hre) =>
    console.log(await getAllUniswapPairsData(hre))
  );
}

export async function getAllUniswapPairsData(hre: HardhatRuntimeEnvironment, onlyWhitelistedTokens = false) {
  const pairs = await getAllUniswapPairs(hre, onlyWhitelistedTokens);
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
