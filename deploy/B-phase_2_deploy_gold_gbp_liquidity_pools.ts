import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getWeth, getUniswapFactory, getBxau, getBgbp } from "../utils/DeployedContractsHelpers";
import { deployPairOracle } from "../utils/DeploymentHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("Starting deployment: liquidity pools");

  const factory = await getUniswapFactory(hre);
  const wethAddress = (await getWeth(hre)).address;

  const bxau = await getBxau(hre);
  const bgbp = await getBgbp(hre);
  const stables = [bxau, bgbp];

  for (const bdStable of stables) {
    const symbol = await bdStable.symbol();
    await (await factory.createPair(bdStable.address, wethAddress)).wait();
    await deployPairOracle(hre, symbol, "WETH", bdStable.address, wethAddress);
  }

  console.log("Finished deployment: liquidity pools");

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["LiquidityPools"];
func.dependencies = ["UniswapHelpers", "bXAU", "bGBP"];
export default func;
