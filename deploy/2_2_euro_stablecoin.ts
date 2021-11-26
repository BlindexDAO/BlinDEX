import { BDStable } from '../typechain/BDStable';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import * as constants from '../utils/Constants'
import { BdStablePool } from '../typechain/BdStablePool';
import { getBdx, getDeployer, getTreasury } from '../utils/DeployedContractsHelpers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: euro stable");

  const deployer = await getDeployer(hre);
  const treasury = await getTreasury(hre);

  const bdx = await getBdx(hre);
  const bdPoolLibraryDeployment = await hre.ethers.getContract('BdPoolLibrary');

  const bdeu_proxy = await hre.deployments.deploy('BDEU', {
    from: deployer.address,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
      execute: {
        init: {
          methodName: "initialize",
          args: [
            'BlindexEuro',
            'BDEU',
            'EURO',
            treasury.address,
            bdx.address,
            constants.initalBdStableToOwner_d18[hre.network.name]
          ]
        }
      }
    },
    contract: 'BDStable',
    args: []
  });

  const bdEu = await hre.ethers.getContract('BDEU') as BDStable;
  console.log("BDEU deployed to:", bdEu.address);

  const bdeu_weth_BdStablePoolDeployment = await hre.deployments.deploy(
    'BDEU_WETH_POOL',
    {
      from: deployer.address,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdEu.address,
              bdx.address,
              constants.wETH_address[hre.network.name],
              constants.wETH_precision[hre.network.name],
              true
            ]
          }
        }
      },
      contract: 'BdStablePool',
      args: [],
      libraries: {
        BdPoolLibrary: bdPoolLibraryDeployment.address
      }
    }
  );

  const bdeu_weth_BdStablePool = await hre.ethers.getContract('BDEU_WETH_POOL') as BdStablePool;
  console.log("BDEU WETH Pool deployed to:", bdeu_weth_BdStablePool.address);

  const bdeu_wbtc_BdStablePoolDeployment = await hre.deployments.deploy(
    'BDEU_WBTC_POOL',
    {
      from: deployer.address,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdEu.address,
              bdx.address,
              constants.wBTC_address[hre.network.name],
              constants.wBTC_precision[hre.network.name],
              false
            ]
          }
        }
      },
      contract: 'BdStablePool',
      args: [],
      libraries: {
        BdPoolLibrary: bdPoolLibraryDeployment.address
      }
    }
  );

  const bdeu_wbtc_BdStablePool = await hre.ethers.getContract('BDEU_WBTC_POOL') as BdStablePool;
  console.log("BDEU WBTC Pool deployed to:", bdeu_wbtc_BdStablePool.address);

  await (await bdx.connect(treasury).transfer(bdEu.address, constants.initalBdStable_bdx_d18[hre.network.name])).wait();
  console.log("BDEU provided with BDX");

  await (await bdEu.addPool(bdeu_weth_BdStablePool.address)).wait()
  console.log("added weth pool");

  await (await bdEu.addPool(bdeu_wbtc_BdStablePool.address)).wait()
  console.log("added wbtc pool");

  await (await bdx.addBdStableAddress(bdEu.address)).wait()
  console.log("bdStable address set");

  console.log("finished deployment: euro stable");

  // One time migration
  return true;
};
func.id = __filename
func.tags = ['BDEU'];
func.dependencies = ['BDX', 'BdPoolLibrary'];
export default func;