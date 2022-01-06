import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../utils/Constants";
import { formatAddress, getBdEu, getBdUs, getBdx, getDeployer } from "../utils/DeployedContractsHelpers";
import { getPoolKey } from "../utils/UniswapPoolsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: Pause staking");

  const deployer = await getDeployer(hre);

  async function upgradeStakingContracts(addressA: string, addressB: string, nameA: string, nameB: string) {
    const poolKey = getPoolKey(addressA, addressB, nameA, nameB);
    const stakingRewardsContractName = `StakingRewards_${poolKey}`;
    const stakingRewards_ProxyDeployment = await hre.deployments.deploy(stakingRewardsContractName, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy"
      },
      contract: "StakingRewards",
      args: []
    });

    const stakingRewardsContract = await hre.ethers.getContractAt("StakingRewards", formatAddress(hre, stakingRewards_ProxyDeployment.address));
    await (await stakingRewardsContract.pause()).wait();
  }

  const bdx = await getBdx(hre);
  const networkName = hre.network.name;

  console.log(`Starting deployment of BDX WETH staking contracts`);
  await upgradeStakingContracts(bdx.address, formatAddress(hre, constants.wETH_address[networkName]), "BDX", "WETH");

  console.log(`Starting deployment of BDX WBTC staking contracts`);
  await upgradeStakingContracts(bdx.address, formatAddress(hre, constants.wBTC_address[networkName]), "BDX", "WBTC");

  const bdEu = await getBdEu(hre);
  const bdUs = await getBdUs(hre);
  const stables = [bdEu, bdUs];

  for (const stable of stables) {
    const symbol = await stable.symbol();
    console.log(`Starting deployment of ${symbol} staking contracts`);

    await upgradeStakingContracts(bdx.address, stable.address, "BDX", symbol);
    await upgradeStakingContracts(stable.address, formatAddress(hre, constants.wETH_address[networkName]), symbol, "WETH");
    await upgradeStakingContracts(stable.address, formatAddress(hre, constants.wBTC_address[networkName]), symbol, "WBTC");

    console.log(`Finished deployment of ${symbol} staking contracts`);
  }

  await upgradeStakingContracts(bdEu.address, bdUs.address, "BDEU", "BDUS");

  console.log("finished deployment: Pause staking");

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["PauseStaking"];
func.dependencies = ["StakingRewards"];
export default func;
