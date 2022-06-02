import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import type { DeployResult } from "hardhat-deploy/dist/types";
import { getBdx, getDeployer } from "../../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: ZapMint");

  const deployer = await getDeployer(hre);
  const bdx = await getBdx(hre);
  const zapMint: DeployResult = await hre.deployments.deploy("ZapMint", {
    from: deployer.address,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [bdx.address]
        }
      }
    },
    contract: "ZapMint",
    args: []
  });

  console.log("deployed ZapMint to: " + zapMint.address);
  console.log("finished deployment: ZapMint");

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["ZapMint"];
func.dependencies = [];
export default func;
