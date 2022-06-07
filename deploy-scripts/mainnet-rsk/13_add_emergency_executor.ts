import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, bdStablesContractsDetails } from "../../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: introduce emergency executor");

  const deployer = await getDeployer(hre);

  const initialDeployBDStables = Object.values(bdStablesContractsDetails).filter(stableDetails =>
    ["BDEU", "BDUS", "bXAU", "bGBP"].includes(stableDetails.symbol)
  );
  for (const stableDetails of initialDeployBDStables) {
    console.log(`Upgrading bdStable: ${stableDetails.name}`);

    await hre.deployments.deploy(stableDetails.symbol, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy"
      },
      contract: "BDStable"
    });

    for (const poolName of [stableDetails.pools.weth.name, stableDetails.pools.wbtc.name]) {
      console.log(`Upgrading bdStablePool: ${poolName}`);

      await hre.deployments.deploy(poolName, {
        from: deployer.address,
        proxy: {
          proxyContract: "OptimizedTransparentProxy"
        },
        contract: "BdStablePool",
        libraries: {
          BdPoolLibrary: (await hre.ethers.getContract("BdPoolLibrary")).address
        }
      });
    }
  }

  console.log(`Upgrading staking rewards distribution`);
  await hre.deployments.deploy("StakingRewardsDistribution", {
    from: deployer.address,
    proxy: {
      proxyContract: "OptimizedTransparentProxy"
    },
    contract: "StakingRewardsDistribution"
  });

  console.log(`Upgrading vesting`);
  await hre.deployments.deploy("Vesting", {
    from: deployer.address,
    proxy: {
      proxyContract: "OptimizedTransparentProxy"
    },
    contract: "Vesting"
  });

  console.log("finished deployment: introduce emergency executor");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["EmergencyExecutor"];
func.dependencies = ["Timelock"];
export default func;
