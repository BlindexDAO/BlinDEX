import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getBot, getDeployer, getWethPair, getWethPairOracle } from "../utils/DeployedContractsHelpers";
import { DeployResult } from "hardhat-deploy/dist/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: UpdaterRSK");

  const networkName = hre.network.name;
  const deployer = await getDeployer(hre);
  const bot = await getBot(hre);

  let updater: DeployResult;
  updater = await hre.deployments.deploy("UpdaterRSK", {
    from: deployer.address,
    contract: "UpdaterRSK",
    args: [bot.address]
  });
  console.log("deployed UpdaterRSK to: " + updater.address);
  console.log("finished deployment: UpdaterRSK");

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["UpdaterRSK"];
func.dependencies = ["PriceFeeds", "LiquidityPools", "BDEU"];
export default func;
