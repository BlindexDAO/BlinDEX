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
  const bdxPoolData = { name: "BDX", token: bdx };
  const wethPoolData = { name: "WETH", token: weth };
  const wbtcPoolData = { name: "WBTC", token: wbtc };

  // In each sub array, the order of the first object matters.
  // BDX should always come first in any sub array, then BDStable and only then the collateral (WBTC/WETH)
  // This is important when providing liquidity in the SystemSetup.ts file
  const pools = [
    [bdxPoolData, wethPoolData],
    [bdxPoolData, wbtcPoolData]
  ];

  for (const stable of bdStables) {
    const symbol = await stable.symbol();

    pools.push([bdxPoolData, { name: symbol, token: stable }]);
    pools.push([{ name: symbol, token: stable }, wethPoolData]);
    pools.push([{ name: symbol, token: stable }, wbtcPoolData]);
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
