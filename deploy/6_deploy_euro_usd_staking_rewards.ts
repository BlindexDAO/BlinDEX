import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../utils/Constants";
import { formatAddress, getBdEu, getBdUs, getBdx } from "../utils/DeployedContractsHelpers";
import { setupStakingContract } from "../utils/DeploymentHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkName = hre.network.name;

  const bdx = await getBdx(hre);

  console.log("Setting up staking contracts");

  await setupStakingContract(
    hre,
    bdx.address,
    formatAddress(hre, constants.wrappedNativeTokenData[networkName].address),
    "BDX",
    "WETH",
    false,
    constants.BASE_STAKING_MULTIPLIER
  );
  await setupStakingContract(
    hre,
    bdx.address,
    formatAddress(hre, constants.wBTC_address[networkName]),
    "BDX",
    "WBTC",
    false,
    constants.BASE_STAKING_MULTIPLIER
  );

  const bdEu = await getBdEu(hre);
  const bdUs = await getBdUs(hre);
  const stables = [bdEu, bdUs];

  for (const stable of stables) {
    const symbol = await stable.symbol();
    console.log(`Starting deployment of ${symbol} staking contracts`);

    await setupStakingContract(hre, bdx.address, stable.address, "BDX", symbol, true, constants.BASE_STAKING_MULTIPLIER);
    await setupStakingContract(
      hre,
      stable.address,
      formatAddress(hre, constants.wrappedNativeTokenData[networkName].address),
      symbol,
      "WETH",
      false,
      constants.BASE_STAKING_MULTIPLIER
    );
    await setupStakingContract(
      hre,
      stable.address,
      formatAddress(hre, constants.wBTC_address[networkName]),
      symbol,
      "WBTC",
      false,
      constants.BASE_STAKING_MULTIPLIER
    );

    console.log(`Finished deployment of ${symbol} staking contracts`);
  }

  await setupStakingContract(hre, bdEu.address, bdUs.address, "BDEU", "BDUS", true, constants.BASE_STAKING_MULTIPLIER);
  console.log(`Finished deployment of BDEU/BDUS staking contracts`);

  console.log("Finished deployment of all the staking contracts");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["StakingRewards"];
func.dependencies = ["LiquidityPools", "StakingRewardsDistribution", "Vesting"];
export default func;
