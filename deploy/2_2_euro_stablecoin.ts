import { BDStable } from '../typechain/BDStable';
import { BDXShares } from '../typechain/BDXShares';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import * as constants from '../utils/Constants'
import { BdStablePool } from '../typechain/BdStablePool';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: euro stable");

  const deployerAddress = (await hre.getNamedAccounts()).DEPLOYER;
  const treasuryAddress = (await hre.getNamedAccounts()).TREASURY;
  const treasury = await hre.ethers.getSigner(treasuryAddress);

  const bdx = await hre.ethers.getContract('BDXShares', deployerAddress) as BDXShares;
  const bdPoolLibraryDeployment = await hre.ethers.getContract('BdPoolLibrary');

  const bdeu_proxy = await hre.deployments.deploy('BDEU', {
    from: deployerAddress,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
      execute: {
        init: {
          methodName: "initialize",
          args: [
            'BlindexEuro',
            'BDEU',
            'EURO',
            deployerAddress,
            treasuryAddress,
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
      from: deployerAddress,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdEu.address,
              bdx.address,
              constants.wETH_address[hre.network.name],
              deployerAddress,
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
      from: deployerAddress,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdEu.address,
              bdx.address,
              constants.wBTC_address[hre.network.name],
              deployerAddress,
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