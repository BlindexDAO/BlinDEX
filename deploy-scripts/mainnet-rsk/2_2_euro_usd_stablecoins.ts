import type { BDStable } from "../../typechain/BDStable";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../../utils/Constants";
import type { BdStablePool } from "../../typechain/BdStablePool";
import { bdStablesContractsDetails, formatAddress, getBdx, getDeployer, getTreasurySigner } from "../../utils/DeployedContractsHelpers";

export const bdStablePoolContractName = "BdStablePool";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const initialDeployBDStables = Object.values(bdStablesContractsDetails).filter(stableDetails => ["BDEU", "BDUS"].includes(stableDetails.symbol));
  for (const stableDetails of initialDeployBDStables) {
    console.log(`Starting deployment: ${stableDetails.fiat} stable - ${stableDetails.symbol}`);

    const deployer = await getDeployer(hre);
    const treasury = await getTreasurySigner(hre);

    const bdx = await getBdx(hre);
    const bdPoolLibraryDeployment = await hre.ethers.getContract("BdPoolLibrary");

    await hre.deployments.deploy(stableDetails.symbol, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        execute: {
          init: {
            methodName: "initialize",
            args: [
              stableDetails.name,
              stableDetails.symbol,
              treasury.address,
              bdx.address,
              constants.initialBdstableMintingAmount(hre.network.name, stableDetails.symbol)
            ]
          }
        }
      },
      contract: "BDStable",
      args: []
    });

    const bdstable = (await hre.ethers.getContract(stableDetails.symbol)) as BDStable;
    console.log(`${stableDetails.symbol} deployed to:`, bdstable.address);

    await hre.deployments.deploy(stableDetails.pools.weth.name, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdstable.address,
              bdx.address,
              formatAddress(hre, constants.wrappedNativeTokenData[hre.network.name].address),
              constants.wrappedNativeTokenData[hre.network.name].decimals,
              true
            ]
          }
        }
      },
      contract: bdStablePoolContractName,
      args: [],
      libraries: {
        BdPoolLibrary: bdPoolLibraryDeployment.address
      }
    });

    const bdstable_weth_BdStablePool = (await hre.ethers.getContract(stableDetails.pools.weth.name)) as BdStablePool;
    console.log(`${stableDetails.pools.weth.name} pool deployed to:`, bdstable_weth_BdStablePool.address);

    await hre.deployments.deploy(stableDetails.pools.wbtc.name, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdstable.address,
              bdx.address,
              formatAddress(hre, constants.wrappedSecondaryTokenData[hre.network.name].address),
              constants.wrappedSecondaryTokenData[hre.network.name].decimals,
              false
            ]
          }
        }
      },
      contract: bdStablePoolContractName,
      args: [],
      libraries: {
        BdPoolLibrary: bdPoolLibraryDeployment.address
      }
    });

    const bdstable_wbtc_BdStablePool = (await hre.ethers.getContract(stableDetails.pools.wbtc.name)) as BdStablePool;
    console.log(`${stableDetails.pools.wbtc.name} pool deployed to:`, bdstable_wbtc_BdStablePool.address);

    await (await bdx.connect(treasury).transfer(bdstable.address, constants.INITIAL_BDX_AMOUNT_FOR_BDSTABLE)).wait();

    console.log(`${stableDetails.symbol} provided with BDX`);

    await (await bdstable.addPool(bdstable_weth_BdStablePool.address)).wait();
    console.log(`added ${stableDetails.pools.weth.name} pool`);

    await (await bdstable.addPool(bdstable_wbtc_BdStablePool.address)).wait();
    console.log(`added ${stableDetails.pools.wbtc.name} pool`);

    await (await bdx.addBdStableAddress(bdstable.address)).wait();
    console.log(`${stableDetails.symbol} address set in the BDX contract`);

    console.log(`Finished deployment: ${stableDetails.fiat} stable - ${stableDetails.symbol}`);
  }

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["BDEU", "BDUS"];
func.dependencies = ["BDX", "BdPoolLibrary"];
export default func;
