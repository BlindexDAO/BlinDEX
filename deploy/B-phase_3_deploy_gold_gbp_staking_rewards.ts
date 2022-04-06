import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../utils/Constants";
import { formatAddress, getBgbp, getBxau } from "../utils/DeployedContractsHelpers";
import { setupStakingContract } from "../utils/DeploymentHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkName = hre.network.name;

  console.log("Setting up staking contracts");

  const bxau = await getBxau(hre);
  const bgbp = await getBgbp(hre);
  const stables = [bxau, bgbp];

  for (const stable of stables) {
    const symbol = await stable.symbol();
    console.log(`Starting deployment of ${symbol} staking contracts`);
    await setupStakingContract(hre, stable.address, formatAddress(hre, constants.wETH_address[networkName]), symbol, "WETH", false);
    console.log(`Finished deployment of ${symbol} staking contracts`);
  }

  console.log("Finished deployment of all the staking contracts");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["StakingRewards"];
func.dependencies = ["LiquidityPools", "StakingRewardsDistribution", "Vesting"];
export default func;
