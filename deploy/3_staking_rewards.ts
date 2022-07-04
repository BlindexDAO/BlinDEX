import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const bdxAddress = "0x6542a10E68cEAc1Fa0641ec0D799a7492795AAC1";
const srdAddress = "0x6b7fC9AAB64C12666ddc97a43049E0901BC264F8";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const stakingRewards_ProxyDeployment = await hre.deployments.deploy("StakingRewards", {
    from: (await hre.getNamedAccounts()).DEPLOYER,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [bdxAddress, srdAddress, false]
        }
      }
    },
    contract: "StakingRewards",
    args: []
  });

  console.log("Deployed StakingRewards: " + stakingRewards_ProxyDeployment.address);

  console.log("finished deployment: staking rewards");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["StakingRewards"];
func.dependencies = ["StakingRewardsDistribution"];
export default func;
