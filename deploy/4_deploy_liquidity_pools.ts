import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getWeth, getWbtc, getBdx, getDeployer, getUniswapFactory, getBDStable } from "../utils/DeployedContractsHelpers";

async function deployPairOracle(hre: HardhatRuntimeEnvironment, nameA: string, nameB: string, addressA: string, addressB: string) {
  const deployer = await getDeployer(hre);
  const uniswapFactory = await getUniswapFactory(hre);

  await hre.deployments.deploy(`UniswapPairOracle_${nameA}_${nameB}`, {
    from: deployer.address,
    contract: "UniswapPairOracle",
    args: [uniswapFactory.address, addressA, addressB]
  });

  console.log(`Created ${nameA}/${nameB} liquidity pool pair`);
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("Starting deployment: liquidity pools");

  const bdx = await getBdx(hre);
  const factory = await getUniswapFactory(hre);
  const wethAddress = (await getWeth(hre)).address;
  const wbtcAddress = (await getWbtc(hre)).address;

  const stables = [await getBDStable(hre, "BDEU"), await getBDStable(hre, "BDUS")];

  await (await factory.createPair(bdx.address, wethAddress)).wait();
  await deployPairOracle(hre, "BDX", "WETH", bdx.address, wethAddress);

  await (await factory.createPair(bdx.address, wbtcAddress)).wait();
  await deployPairOracle(hre, "BDX", "WBTC", bdx.address, wbtcAddress);

  for (const bdStable of stables) {
    const symbol = await bdStable.symbol();

    await (await factory.createPair(bdx.address, bdStable.address)).wait();
    await deployPairOracle(hre, "BDX", symbol, bdx.address, bdStable.address);

    await (await factory.createPair(bdStable.address, wethAddress)).wait();
    await deployPairOracle(hre, symbol, "WETH", bdStable.address, wethAddress);

    await (await factory.createPair(bdStable.address, wbtcAddress)).wait();
    await deployPairOracle(hre, symbol, "WBTC", bdStable.address, wbtcAddress);
  }

  console.log("Finished deployment: liquidity pools");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["LiquidityPools"];
func.dependencies = ["BDX", "BdxMint", "UniswapHelpers", "BDUS", "BDEU"];
export default func;
