import { BDStable } from "../typechain/BDStable";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../utils/Constants";
import { BdStablePool } from "../typechain/BdStablePool";
import { getBdx, getDeployer, getTreasury } from "../utils/DeployedContractsHelpers";

interface BDStableContractDetail {
  [key: string]: {
    symbol: string;
    name: string;
    fiat: string;
    pools: {
      weth: { name: string };
      wbtc: { name: string };
    };
  };
}

function prepareStablesContractsDetails() {
  const bdstablesDetails = [
    {
      symbol: "BDEU",
      name: "Blindex Euro",
      fiat: "EUR"
    },
    {
      symbol: "BDUS",
      name: "Blindex USD",
      fiat: "USD"
    }
  ];

  const stables: BDStableContractDetail = {};

  for (const bdstable of bdstablesDetails) {
    const pools = {
      weth: {
        name: `${bdstable.symbol}_WETH_POOL`
      },
      wbtc: {
        name: `${bdstable.symbol}_WBTC_POOL`
      }
    };

    stables[bdstable.symbol] = Object.assign(bdstable, { pools });
  }

  return stables;
}

export const ContractsDetails: BDStableContractDetail = prepareStablesContractsDetails();

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  for (const stableDetails of Object.values(ContractsDetails)) {
    console.log(`Starting deployment: ${stableDetails.fiat} stable - ${stableDetails.symbol}`);

    const deployer = await getDeployer(hre);
    const treasury = await getTreasury(hre);

    const bdx = await getBdx(hre);
    const bdPoolLibraryDeployment = await hre.ethers.getContract("BdPoolLibrary");

    const bdstable_proxy = await hre.deployments.deploy(stableDetails.symbol, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        execute: {
          init: {
            methodName: "initialize",
            args: [stableDetails.name, stableDetails.symbol, treasury.address, bdx.address, constants.initialBdstableMintingAmount(hre.network.name)]
          }
        }
      },
      contract: "BDStable",
      args: []
    });

    const bdstable = (await hre.ethers.getContract(stableDetails.symbol)) as BDStable;
    console.log(`${stableDetails.symbol} deployed to:`, bdstable.address);

    const bdstable_weth_BdStablePoolDeployment = await hre.deployments.deploy(stableDetails.pools.weth.name, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        execute: {
          init: {
            methodName: "initialize",
            args: [bdstable.address, bdx.address, constants.wETH_address[hre.network.name], constants.wETH_precision[hre.network.name], true]
          }
        }
      },
      contract: "BdStablePool",
      args: [],
      libraries: {
        BdPoolLibrary: bdPoolLibraryDeployment.address
      }
    });

    const bdstable_weth_BdStablePool = (await hre.ethers.getContract(stableDetails.pools.weth.name)) as BdStablePool;
    console.log(`${stableDetails.pools.weth.name} pool deployed to:`, bdstable_weth_BdStablePool.address);

    const bdstable_wbtc_BdStablePoolDeployment = await hre.deployments.deploy(stableDetails.pools.wbtc.name, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        execute: {
          init: {
            methodName: "initialize",
            args: [bdstable.address, bdx.address, constants.wBTC_address[hre.network.name], constants.wBTC_precision[hre.network.name], false]
          }
        }
      },
      contract: "BdStablePool",
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
// We cannot just use: ...getAllBDStablesSymbols() as it uses an object exported by thi sfile and therefore we'll have a circular dependency.
// Everywhere else needed can use ...getAllBDStablesSymbols()
func.tags = [...Object.values(ContractsDetails).map((stable) => stable.symbol)];
func.dependencies = ["BDX", "BdPoolLibrary"];
export default func;
