import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../utils/Constants";
import { getBdEu, getBdx, getDeployer, getUniswapFactory } from "../utils/DeployedContractsHelpers";

async function deployPairOracle(hre: HardhatRuntimeEnvironment, nameA: string, nameB: string, addressA: string, addressB: string) {
  const deployer = await getDeployer(hre);
  const uniswapFactory = await getUniswapFactory(hre);

  await hre.deployments.deploy(`UniswapPairOracle_${nameA}_${nameB}`, {
    from: deployer.address,
    contract: "UniswapPairOracle",
    args: [uniswapFactory.address, addressA, addressB]
  });
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: liquidity pools");

  const bdx = await getBdx(hre);
  const bdeu = await getBdEu(hre);
  const factory = await getUniswapFactory(hre);

  const wethAddress = constants.wETH_address[hre.network.name];
  const wbtcAddress = constants.wBTC_address[hre.network.name];

  await (await factory.createPair(bdx.address, bdeu.address)).wait();
  await deployPairOracle(hre, "BDX", "BDEU", bdx.address, bdeu.address);
  console.log("created bdx bdeu pair");

  await (await factory.createPair(bdx.address, wethAddress)).wait();
  await deployPairOracle(hre, "BDX", "WETH", bdx.address, wethAddress);
  console.log("created bdx weth pair");

  await (await factory.createPair(bdx.address, wbtcAddress)).wait();
  await deployPairOracle(hre, "BDX", "WBTC", bdx.address, wbtcAddress);
  console.log("created bdx wbtc pair");

  await (await factory.createPair(bdeu.address, wethAddress)).wait();
  await deployPairOracle(hre, "BDEU", "WETH", bdeu.address, wethAddress);
  console.log("created bdeu weth pair");

  await (await factory.createPair(bdeu.address, wbtcAddress)).wait();
  await deployPairOracle(hre, "BDEU", "WBTC", bdeu.address, wbtcAddress);
  console.log("created bdeu wbtc pair");

  console.log("finished deployment: liquidity pools");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["LiquidityPools"];
func.dependencies = ["BDX", "BDEU", "BdxMint", "UniswapHelpers"];
export default func;
