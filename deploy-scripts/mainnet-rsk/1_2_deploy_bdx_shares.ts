import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { tokensDetails } from "../deploy-scripts-constants";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log(`Starting deployment of: ${tokensDetails.bdx.symbol}`);

  const deployer = (await hre.getNamedAccounts()).DEPLOYER;

  const bdx_proxy = await hre.deployments.deploy(tokensDetails.bdx.symbol, {
    from: deployer,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [tokensDetails.bdx.name, tokensDetails.bdx.symbol]
        }
      }
    },
    contract: tokensDetails.bdx.contract,
    args: []
  });

  console.log(`${tokensDetails.bdx.symbol} deployed to: ${bdx_proxy.address}`);

  console.log(`finished deployment: ${tokensDetails.bdx.symbol}`);

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["BDX"];
func.dependencies = [];
export default func;
