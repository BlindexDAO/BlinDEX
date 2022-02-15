import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../utils/Constants";
import { formatAddress, getBdUs, getUniswapFactory } from "../utils/DeployedContractsHelpers";
import { deployPairOracle, setupStakingContract } from "../utils/DeploymentHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: BDUS-XUSD");

  if (hre.network.name !== "rsk" && hre.network.name !== "mainnetFork") {
    throw Error(`Please add support for new network: ${hre.network.name}`);
  }

  const factory = await getUniswapFactory(hre);
  const bdus = await getBdUs(hre);
  const externalUsdStable = constants.EXTERNAL_USD_STABLE[hre.network.name];

  await (await factory.createPair(bdus.address, externalUsdStable.address)).wait();
  await deployPairOracle(hre, "BDUS", externalUsdStable.symbol, bdus.address, externalUsdStable.address);
  await setupStakingContract(hre, bdus.address, formatAddress(hre, externalUsdStable.address), "BDUS", externalUsdStable.symbol, false, 0);

  console.log("finished deployment: BDUS-XUSD");

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["BDUS_XUSD_POOL"];
func.dependencies = ["PriceFeeds", "LiquidityPools", "BDUS"];
export default func;
