import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../../utils/Constants";
import { formatAddress, getBdUs, getUniswapFactory } from "../../utils/DeployedContractsHelpers";
import { deployPairOracle, setupStakingContract } from "../../utils/DeploymentHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: BDUS-DOC");

  const factory = await getUniswapFactory(hre);
  const bdus = await getBdUs(hre);
  const secondaryExternalUsdStable = constants.SECONDARY_EXTERNAL_USD_STABLE[hre.network.name];

  await (await factory.createPair(bdus.address, formatAddress(hre, secondaryExternalUsdStable.address))).wait();
  await deployPairOracle(hre, "BDUS", secondaryExternalUsdStable.symbol, bdus.address, formatAddress(hre, secondaryExternalUsdStable.address));
  await setupStakingContract(
    hre,
    bdus.address,
    formatAddress(hre, secondaryExternalUsdStable.address),
    "BDUS",
    secondaryExternalUsdStable.symbol,
    false,
    0
  );

  console.log("finished deployment: BDUS-DOC");

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["BDUS_DOC_POOL"];
func.dependencies = ["bXAU_Price_Feeds", "bGBP_Price_Feeds"];
export default func;
