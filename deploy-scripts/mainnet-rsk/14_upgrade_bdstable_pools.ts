import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { bdStablesContractsDetails, getDeployer } from "../../utils/DeployedContractsHelpers";
import { deployContract } from "../../utils/DeploymentHelpers";
import { bdStablePoolContractName } from "./2_2_euro_usd_stablecoins";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const initialDeployBDStables = Object.values(bdStablesContractsDetails);
  const bdPoolLibraryDeployment = await hre.ethers.getContract("BdPoolLibrary");

  for (let index = 0; index < initialDeployBDStables.length; index++) {
    const stableDetails = initialDeployBDStables[index];

    await deployContract(`Upgrade ${stableDetails.pools.weth.name} BDStablePools`, async () => {
      const deployer = await getDeployer(hre);

      await hre.deployments.deploy(stableDetails.pools.weth.name, {
        from: deployer.address,
        proxy: {
          proxyContract: "OptimizedTransparentProxy"
        },
        contract: bdStablePoolContractName,
        log: true,
        libraries: {
          BdPoolLibrary: bdPoolLibraryDeployment.address
        }
      });
    });

    await deployContract(`Upgrade ${stableDetails.pools.wbtc.name} BDStablePools`, async () => {
      const deployer = await getDeployer(hre);

      await hre.deployments.deploy(stableDetails.pools.wbtc.name, {
        from: deployer.address,
        proxy: {
          proxyContract: "OptimizedTransparentProxy"
        },
        contract: bdStablePoolContractName,
        log: true,
        libraries: {
          BdPoolLibrary: bdPoolLibraryDeployment.address
        }
      });
    });
  }

  return true;
};

func.id = __filename;
func.tags = ["BdStablePool-Upgrade-V2"];
func.dependencies = ["BdStablePool"];
func.skip = (_env: HardhatRuntimeEnvironment) => Promise.resolve(false);
export default func;
