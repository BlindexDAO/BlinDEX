import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { IERC20 } from "../typechain/IERC20";
import { getBdEu, getBdx, getWeth, getWbtc, getUniswapPairOracle, getERC20, getBot } from "./DeployedContractsHelpers";

export async function updateUniswapPairsOracles(hre: HardhatRuntimeEnvironment, signer: SignerWithAddress | null = null) {
  console.log("starting updating oracles");

  const pools = await getPools(hre);

  for (let pool of pools) {
    await updateOracle(hre, pool[0].name, pool[1].name, signer);
    console.log(`updated ${pool[0].name} / ${pool[1].name}`);
  }

  console.log("finished updating oracles");
}

export async function resetUniswapPairsOracles(hre: HardhatRuntimeEnvironment) {
  console.log("starting reseting oracles");

  const pools = await getPools(hre);

  for (let pool of pools) {
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
  const bdEu = await getBdEu(hre);

  // order is important BDX -> BDStable -> collateral
  return [
    [
      { name: "BDX", token: bdx },
      { name: "BDEU", token: bdEu }
    ],
    [
      { name: "BDEU", token: bdEu },
      { name: "WETH", token: weth }
    ],
    [
      { name: "BDEU", token: bdEu },
      { name: "WBTC", token: wbtc }
    ],
    [
      { name: "BDX", token: bdx },
      { name: "WETH", token: weth }
    ],
    [
      { name: "BDX", token: bdx },
      { name: "WBTC", token: wbtc }
    ]
  ];
}

export function tokensDecimals(hre: HardhatRuntimeEnvironment, tokenName: string): number {
  if (["BDX", "BDEU", "WETH"].includes(tokenName)) {
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
