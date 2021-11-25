import { HardhatRuntimeEnvironment } from "hardhat/types";
import { IERC20 } from "../typechain/IERC20";
import { IWETH } from "../typechain/IWETH";
import { getBdEu, getBdx, getWeth, getWbtc, getUniswapPairOracle, getERC20 } from "./DeployedContractsHelpers";

export async function updateOracles(hre: HardhatRuntimeEnvironment) {
    console.log("starting updating oracles");

    const pools = await getPools(hre);

    for (let pool of pools) {
        await updateOracle(hre, pool[0].token, pool[1].token)
        console.log(`updated ${pool[0].name} / ${pool[1].name}`);
    }

    console.log("finished updating oracles")
}

export async function resetOracles(hre: HardhatRuntimeEnvironment) {
    console.log("starting reseting oracles");

    const pools = await getPools(hre);

    for (let pool of pools) {
        await resetOracle(hre, pool[0].token, pool[1].token)
        console.log(`reset ${pool[0].name} / ${pool[1].name}`);
    }

    console.log("finished reseting oracles")
}

export async function updateOracle(
    hre: HardhatRuntimeEnvironment,
    tokenA: IERC20,
    tokenB: IERC20) {
    const token0 = await getERC20(hre, tokenA.address);
    const token1 = await getERC20(hre, tokenB.address);

    const symbol0 = await token0.symbol();
    const symbol1 = await token1.symbol();

    const oracle = await getUniswapPairOracle(hre, symbol0, symbol1);

    await (await oracle.updateOracle()).wait();
}

export async function resetOracle(
    hre: HardhatRuntimeEnvironment,
    tokenA: IERC20,
    tokenB: IERC20) {
    const token0 = await getERC20(hre, tokenA.address);
    const token1 = await getERC20(hre, tokenB.address);

    const symbol0 = await token0.symbol();
    const symbol1 = await token1.symbol();

    const oracle = await getUniswapPairOracle(hre, symbol0, symbol1);

    await (await oracle.reset()).wait();
}

export async function getPools(hre: HardhatRuntimeEnvironment) : Promise<{name: string, token: IERC20}[][]> {
    const weth = await getWeth(hre);
    const wbtc = await getWbtc(hre);
    const bdx = await getBdx(hre);
    const bdEu = await getBdEu(hre);

    // order is important BDX -> BDStable -> collateral  
    return [
        [{ name: "BDX", token: bdx }, { name: "BDEU", token: bdEu }],
        [{ name: "BDEU", token: bdEu }, { name: "WETH", token: weth }],
        [{ name: "BDEU", token: bdEu }, { name: "WBTC", token: wbtc }],
        [{ name: "BDX", token: bdx }, { name: "WETH", token: weth }],
        [{ name: "BDX", token: bdx }, { name: "WBTC", token: wbtc }],
    ]
}

