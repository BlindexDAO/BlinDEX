import { EXTERNAL_SUPPORTED_TOKENS } from "./Constants";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { IERC20 } from "../typechain/IERC20";
import { getBdx, getWeth, getWbtc, getUniswapPairOracle, getAllBDStables, formatAddress, getUniswapRouter } from "./DeployedContractsHelpers";
import * as constants from "../utils/Constants";
import { Recorder } from "./Recorder/Recorder";
import { toRc } from "./Recorder/RecordableContract";
import { getListOfSupportedLiquidityPools } from "../utils/Constants";
import { BigNumber } from "ethers";
import { to_d18 } from "./NumbersHelpers";

export async function recordUpdateUniswapPairsOracles(hre: HardhatRuntimeEnvironment, recorder: Recorder) {
  const pools = await getPools(hre);
  const promises = pools.map(pool => recordUpdateOracle(hre, pool[0].name, pool[1].name, recorder));

  await Promise.allSettled(promises);
}

export async function recordUpdateOracle(hre: HardhatRuntimeEnvironment, symbol0: string, symbol1: string, recorder: Recorder) {
  const oracle = toRc(await getUniswapPairOracle(hre, symbol0, symbol1), recorder);
  await oracle.record.updateOracle();
}

export async function recordResetUniswapPairsOracles(hre: HardhatRuntimeEnvironment, recorder: Recorder) {
  console.log("starting recording reseting oracles");

  const pools = await getPools(hre);

  for (const pool of pools) {
    await recordResetOracle(hre, pool[0].name, pool[1].name, recorder);
    console.log(`recorded resetting: ${pool[0].name} / ${pool[1].name}`);
  }

  console.log("finished recording reseting oracles");
}

export async function recordResetOracle(hre: HardhatRuntimeEnvironment, symbol0: string, symbol1: string, recorder: Recorder) {
  const oracle = toRc(await getUniswapPairOracle(hre, symbol0, symbol1), recorder);

  await oracle.record.reset();
}

export function sortUniswapPairTokens(tokenAAddress: string, tokenBAddress: string, tokenASymbol: string, tokenBSymbol: string) {
  // Logic form UniswapV2Factory.createPair()

  const retRes =
    Number(tokenAAddress) < Number(tokenBAddress)
      ? { token0Address: tokenAAddress, token1Address: tokenBAddress, token0Symbol: tokenASymbol, token1Symbol: tokenBSymbol }
      : { token0Address: tokenBAddress, token1Address: tokenAAddress, token0Symbol: tokenBSymbol, token1Symbol: tokenASymbol };

  return retRes;
}

export function getPoolKey(tokenAAddress: string, tokenBAddress: string, tokenASymbol: string, tokenbSymbol: string) {
  const sortedTokens = sortUniswapPairTokens(tokenAAddress, tokenBAddress, tokenASymbol, tokenbSymbol);

  return `${sortedTokens.token0Symbol}_${sortedTokens.token1Symbol}`;
}

export type PoolTokenData = { name: string; token: IERC20 };

export async function getPools(hre: HardhatRuntimeEnvironment): Promise<{ name: string; token: IERC20 }[][]> {
  const weth = await getWeth(hre);
  const wbtc = await getWbtc(hre);
  const bdx = await getBdx(hre);
  const bdStables = await getAllBDStables(hre);
  const bdxSymbol = await bdx.symbol();
  const bdxPoolData = { name: bdxSymbol, token: bdx };
  const wethPoolData = { name: "WETH", token: weth };
  const wbtcPoolData = { name: "WBTC", token: wbtc };
  const externalUsdStable = constants.EXTERNAL_USD_STABLE[hre.network.name];
  const externalUsdStableContract = (await hre.ethers.getContractAt("IERC20", hre.ethers.utils.getAddress(externalUsdStable.address))) as IERC20;
  const externalUsdStablePoolData = { name: externalUsdStable.symbol, token: externalUsdStableContract };
  const secondaryExternalUsdStable = constants.SECONDARY_EXTERNAL_USD_STABLE[hre.network.name];
  const secondaryExternalUsdStableContract = (await hre.ethers.getContractAt(
    "IERC20",
    hre.ethers.utils.getAddress(formatAddress(hre, secondaryExternalUsdStable.address))
  )) as IERC20;
  const secondaryExternalUsdStablePoolData = { name: secondaryExternalUsdStable.symbol, token: secondaryExternalUsdStableContract };
  const tokenToPoolTokenData: { [symbol: string]: PoolTokenData } = {
    ["WETH"]: wethPoolData,
    ["WBTC"]: wbtcPoolData,
    [externalUsdStable.symbol]: externalUsdStablePoolData,
    [secondaryExternalUsdStable.symbol]: secondaryExternalUsdStablePoolData,
    [bdxSymbol]: bdxPoolData
  };
  await Promise.all(
    bdStables.map(async bdStable => {
      const symbol = await bdStable.symbol();
      tokenToPoolTokenData[symbol] = { name: symbol, token: bdStable };
    })
  );

  // In each sub array, the order of the first object matters.
  // BDX should always come first in any sub array, then BDStable and only then the collateral (WBTC/WETH)
  // This is important when providing liquidity in the SystemSetup.ts file
  const pools: PoolTokenData[][] = [];
  const registeredPools = new Set<string>();

  function registerPool(dataA: { name: string; token: IERC20 }, dataB: { name: string; token: IERC20 }) {
    const poolKey = getPoolKey(dataA.token.address, dataB.token.address, dataA.name, dataB.name);
    if (registeredPools.has(poolKey)) {
      throw `Trying to add the same pool twice: ${dataA.name}:${dataB.name}`;
    }

    const sortedTokens = sortUniswapPairTokens(dataA.token.address, dataB.token.address, dataA.name, dataB.name);
    const data0 = dataA.name === sortedTokens.token0Symbol ? dataA : dataB;
    const data1 = dataA.name === sortedTokens.token0Symbol ? dataB : dataA;

    pools.push([data0, data1]);
    registeredPools.add(poolKey);
  }
  const supportedLiquidityPools = getListOfSupportedLiquidityPools(hre.network.name);
  supportedLiquidityPools.forEach(({ tokenA, tokenB }) => registerPool(tokenToPoolTokenData[tokenA], tokenToPoolTokenData[tokenB]));
  return pools;
}

export async function getAvailableSwapLinks(hre: HardhatRuntimeEnvironment) {
  const pools = await getPools(hre);

  const availableLinks = [];

  for (const pool of pools) {
    availableLinks.push({ from: pool[0].token.address, to: pool[1].token.address });
    availableLinks.push({ from: pool[1].token.address, to: pool[0].token.address });
  }

  return availableLinks;
}

export async function generatePaths(
  hre: HardhatRuntimeEnvironment,
  amountIn: BigNumber,
  addressIn: string,
  addressOut: string
): Promise<{ path: string[]; amountOut: BigNumber }[]> {
  const availableSwapLinks = await getAvailableSwapLinks(hre);

  const midTokens = [];

  for (const link1 of availableSwapLinks) {
    if (link1.from !== addressIn) {
      continue;
    }
    for (const link2 of availableSwapLinks) {
      if (link1.to !== link2.from) {
        continue;
      }
      if (link2.to !== addressOut) {
        continue;
      }

      midTokens.push(link1.to);
    }
  }

  const paths = [[addressIn, addressOut], ...midTokens.map(x => [addressIn, x, addressOut])];

  const router = await getUniswapRouter(hre);
  const pathsPrices = [];

  for (const path of paths) {
    let amountsOut;
    try {
      amountsOut = await router.getAmountsOut(amountIn, path);
    } catch {
      continue; // handle unsupported paths like [wrbtc -> eths -> bdx]
    }

    pathsPrices.push({
      path: path,
      amountOut: amountsOut[amountsOut.length - 1]
    });
  }

  return pathsPrices;
}

export async function generateAllPaths(
  hre: HardhatRuntimeEnvironment,
  excludeAsInputTokens: string[],
  requiredTokensOut: string[]
): Promise<string[][]> {
  const allTokensAddresses = await getAllTokensAddresses(hre, excludeAsInputTokens);
  let allRequiredPaths: string[][] = [];
  for (const tokenAddressIn of allTokensAddresses) {
    for (const requiredTokenOut of requiredTokensOut) {
      if (requiredTokensOut.includes(tokenAddressIn)) {
        continue;
      }
      const pathsWithAmountOut = await generatePaths(hre, to_d18(1), tokenAddressIn, requiredTokenOut);
      const paths = pathsWithAmountOut.map(pathWithAmountOut => pathWithAmountOut.path);
      allRequiredPaths.push(...paths);
    }
  }

  const supportedPools = await getAvailableSwapLinks(hre);
  allRequiredPaths = allRequiredPaths.filter(path => {
    const isFirstPairSupported = supportedPools.some(pool => pool.from === path[0] && pool.to === path[1]);
    const isSecondPairSupported = path.length > 2 ? supportedPools.some(pool => pool.from === path[1] && pool.to === path[2]) : true;
    return isFirstPairSupported && isSecondPairSupported;
  });

  return allRequiredPaths;
}

export async function chooseBestPath(pathsPrices: { amountOut: BigNumber; path: string[] }[]) {
  const bestPath = pathsPrices.reduce((prev, current) => (prev.amountOut.gt(current.amountOut) ? prev : current));
  return bestPath;
}

export async function getAllTokensAddresses(hre: HardhatRuntimeEnvironment, excludeAddresses: string[]): Promise<string[]> {
  const weth = await getWeth(hre);
  const wbtc = await getWbtc(hre);
  const bdx = await getBdx(hre);
  const allStables = await getAllBDStables(hre);
  let addresses = [
    bdx.address,
    weth.address,
    wbtc.address,
    ...EXTERNAL_SUPPORTED_TOKENS.map(token => token[hre.network.name].address),
    ...allStables.map(stable => stable.address)
  ];

  addresses = addresses.filter(address => !excludeAddresses.find(excludeAddress => excludeAddress === address));
  return addresses;
}
