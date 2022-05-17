import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { tokensDetails } from "../deploy-scripts-constants";
import { deployContract } from "../../utils/DeploymentHelpers";
import { getDeployer } from "../../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  return await deployContract(`${tokensDetails.bdx.symbol}`, async () => {
    const deployer = await getDeployer(hre);

    const bdx_proxy = await hre.deployments.deploy(tokensDetails.bdx.symbol, {
      from: deployer.address,
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
  });
};

func.id = __filename;
func.tags = ["BDX"];
func.dependencies = [];

export default func;
