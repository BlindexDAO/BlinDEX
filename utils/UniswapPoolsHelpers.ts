import type { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { IERC20 } from "../typechain/IERC20";
import { getBdx, getWeth, getWbtc, getUniswapPairOracle, getBot, getAllBDStables, getBdUs } from "./DeployedContractsHelpers";
import * as constants from "../utils/Constants";

export async function updateUniswapPairsOracles(hre: HardhatRuntimeEnvironment, signer: SignerWithAddress | null = null) {
  console.log("Starting tp update the Uniswap oracles");

  const pools = await getPools(hre);
  const promises = pools.map(pool => updateOracle(hre, pool[0].name, pool[1].name, signer));

  await Promise.allSettled(promises);

  console.log("Finished updating the Uniswap oracles");
}

export async function resetUniswapPairsOracles(hre: HardhatRuntimeEnvironment) {
  console.log("starting reseting oracles");

  const pools = await getPools(hre);

  for (const pool of pools) {
    await resetOracle(hre, pool[0].name, pool[1].name);
    console.log(`reset ${pool[0].name} / ${pool[1].name}`);
  }

  console.log("finished reseting oracles");
}

export async function updateOracle(hre: HardhatRuntimeEnvironment, symbol0: string, symbol1: string, signer: SignerWithAddress | null = null) {
  const oracle = await getUniswapPairOracle(hre, symbol0, symbol1);

  const updater = signer === null ? await getBot(hre) : signer;
  const oracleName = `${symbol0} / ${symbol1}`;

  try {
    console.log(`Starting to update ${oracleName}`);
    await (await oracle.connect(updater).updateOracle()).wait();
    console.log(`Updated ${oracleName}`);
  } catch (e) {
    console.log(`Error while updating ${oracleName}`, e);
  }
}

export async function resetOracle(hre: HardhatRuntimeEnvironment, symbol0: string, symbol1: string) {
  const oracle = await getUniswapPairOracle(hre, symbol0, symbol1);

  await (await oracle.reset()).wait();
}

export function sortUniswapPairTokens(tokenAAddress: string, tokenBAddress: string, tokenASymbol: string, tokenBSymbol: string) {
  // Logic form UniswapV2Factory.createPair()
  // TODO verify on RSK if we have to lowercase addresses

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

export async function getPools(hre: HardhatRuntimeEnvironment): Promise<{ name: string; token: IERC20 }[][]> {
  const weth = await getWeth(hre);
  const wbtc = await getWbtc(hre);
  const bdx = await getBdx(hre);
  const bdStables = await getAllBDStables(hre);
  const bdxPoolData = { name: await bdx.symbol(), token: bdx };
  const wethPoolData = { name: "WETH", token: weth };
  const wbtcPoolData = { name: "WBTC", token: wbtc };

  // In each sub array, the order of the first object matters.
  // BDX should always come first in any sub array, then BDStable and only then the collateral (WBTC/WETH)
  // This is important when providing liquidity in the SystemSetup.ts file
  const pools: { name: string; token: IERC20 }[][] = [];
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

  registerPool(bdxPoolData, wethPoolData);
  registerPool(bdxPoolData, wbtcPoolData);

  for (const stableA of bdStables) {
    const symbol = await stableA.symbol();

    pools.push([bdxPoolData, { name: symbol, token: stableA }]);

    const stabl1Data = { name: symbol, token: stableA };

    registerPool(stabl1Data, wethPoolData);
    registerPool(stabl1Data, wbtcPoolData);

    // Add stable-stable pools
    for (const stableB of bdStables) {
      const stableASymbol = await stableA.symbol();
      const stableBSymbol = await stableB.symbol();
      if (stableA !== stableB && !registeredPools.has(getPoolKey(stableA.address, stableB.address, stableASymbol, stableBSymbol))) {
        registerPool({ name: stableASymbol, token: stableA }, { name: stableBSymbol, token: stableB });
      }
    }
  }

  const bdus = await getBdUs(hre);

  const externalUsdStable = constants.EXTERNAL_USD_STABLE[hre.network.name];
  const externalUsdStableContract = (await hre.ethers.getContractAt("IERC20", hre.ethers.utils.getAddress(externalUsdStable.address))) as IERC20;

  registerPool({ name: "BDUS", token: bdus }, { name: externalUsdStable.symbol, token: externalUsdStableContract });

  return pools;
}
