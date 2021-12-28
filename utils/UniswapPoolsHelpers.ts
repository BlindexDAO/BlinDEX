import type { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { IERC20 } from "../typechain/IERC20";
import { getBdx, getWeth, getWbtc, getUniswapPairOracle, getBot, getAllBDStables, getAllBDStablesSymbols } from "./DeployedContractsHelpers";

export async function updateUniswapPairsOracles(hre: HardhatRuntimeEnvironment, signer: SignerWithAddress | null = null) {
  console.log("starting updating oracles");

  const pools = await getPools(hre);

  for (const pool of pools) {
    await updateOracle(hre, pool[0].name, pool[1].name, signer);
    console.log(`updated ${pool[0].name} / ${pool[1].name}`);
  }

  console.log("finished updating oracles");
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

  await (await oracle.connect(updater).updateOracle()).wait();
}

export async function resetOracle(hre: HardhatRuntimeEnvironment, symbol0: string, symbol1: string) {
  const oracle = await getUniswapPairOracle(hre, symbol0, symbol1);

  await (await oracle.reset()).wait();
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

  function getPoolKey(name1: string, name2: string) {
    return `${name1}_${name2}`;
  }

  function registerPool(data1: { name: string; token: IERC20 }, data2: { name: string; token: IERC20 }) {
    if (registeredPools.has(getPoolKey(data1.name, data2.name))) {
      throw `Trying to add the same pool twice: ${data1.name}:${data2.name}`;
    }

    pools.push([data1, data2]);
    registeredPools.add(getPoolKey(data1.name, data2.name));
    registeredPools.add(getPoolKey(data2.name, data1.name));
  }

  registerPool(bdxPoolData, wethPoolData);
  registerPool(bdxPoolData, wbtcPoolData);

  for (const stable1 of bdStables) {
    const symbol = await stable1.symbol();

    pools.push([bdxPoolData, { name: symbol, token: stable1 }]);

    const stabl1Data = { name: symbol, token: stable1 };

    registerPool(stabl1Data, wethPoolData);
    registerPool(stabl1Data, wbtcPoolData);

    // Add stable-stable pools
    for (const stable2 of bdStables) {
      const stable1Symbol = await stable1.symbol();
      const stable2Symbol = await stable2.symbol();
      if (stable1 !== stable2 && !registeredPools.has(getPoolKey(stable1Symbol, stable2Symbol))) {
        registerPool({ name: stable1Symbol, token: stable1 }, { name: stable2Symbol, token: stable2 });
      }
    }
  }

  return pools;
}

export function tokensDecimals(hre: HardhatRuntimeEnvironment, tokenName: string): number {
  if (["BDX", "WETH", ...getAllBDStablesSymbols()].includes(tokenName)) {
    return 18;
  } else if (tokenName == "WBTC") {
    if (hre.network.name == "rsk") {
      return 18; // ETHs on RSK
    } else {
      return 8;
    }
  } else {
    throw `unknown token '${tokenName}'`;
  }
}
