import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { deployContract } from "../../utils/DeploymentHelpers";
import { getContratAddress, getDeployer } from "../../utils/DeployedContractsHelpers";
import { getListOfSupportedLiquidityPools } from "../../utils/Constants";
import { getPoolKey } from "../../utils/UniswapPoolsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = await getDeployer(hre);
  const supportedStakingPools = getListOfSupportedLiquidityPools(hre.network.name).filter(lp => lp.hasStakingPool);

  for (const sr of supportedStakingPools) {
    const tokenAAddress = await getContratAddress(hre, sr.tokenA);
    const tokenBAddress = await getContratAddress(hre, sr.tokenB);
    const poolKey = getPoolKey(tokenAAddress, tokenBAddress, sr.tokenA, sr.tokenB);

    if (!poolKey.toLowerCase().includes("bgbp")) {
      continue;
    }

    const stakingRewardsContractName = `StakingRewards_${poolKey}`;

    await deployContract(`Upgrade staking rewards: ${stakingRewardsContractName}`, async () => {
      await hre.deployments.deploy(stakingRewardsContractName, {
        from: deployer.address,
        proxy: {
          proxyContract: "OptimizedTransparentProxy"
        },
        contract: "StakingRewards",
        log: true
      });
    });
  }

  return true;
};

func.id = __filename;
func.tags = ["StakingRewards-Upgrade-V2"];
func.dependencies = ["StakingRewards", "bXAU_Staking_Pools", "bGBP_Staking_Pools", "BDUS_DOC_POOL"];
func.skip = (_env: HardhatRuntimeEnvironment) => Promise.resolve(false);
export default func;
