import { BDStable } from '../typechain/BDStable';
import { BDXShares } from '../typechain/BDXShares';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import * as constants from '../utils/Constants'
import { BdStablePool } from '../typechain/BdStablePool';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
const deployer = (await hre.getNamedAccounts()).DEPLOYER;
const treasury = (await hre.getNamedAccounts()).TREASURY;
  const bdx = await hre.ethers.getContract('BDXShares', deployer) as BDXShares;

  const bdPoolLibraryDeployment = await hre.ethers.getContract('BdPoolLibrary');

  const bdeu_proxy = await hre.deployments.deploy('BDEU', {
    from: deployer,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
      execute: {
        init: {
          methodName: "initialize",
          args: [
            'BlindexEuro',
            'BDEU',
            'EURO',
            deployer,
            treasury,
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
      from: deployer,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdEu.address,
              bdx.address,
              constants.wETH_address[hre.network.name],
              deployer
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
      from: deployer,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdEu.address,
              bdx.address,
              constants.wBTC_address[hre.network.name],
              deployer
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

  await (await bdEu.addPool(bdeu_weth_BdStablePool.address)).wait()
  await (await bdEu.addPool(bdeu_wbtc_BdStablePool.address)).wait()

  await (await bdx.addBdStableAddress(bdEu.address)).wait()

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['BDEU'];
func.dependencies = ['BDX', 'BdPoolLibrary'];
export default func;