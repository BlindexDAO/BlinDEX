import { BDStable } from '../typechain/BDStable';
import { BDXShares } from '../typechain/BDXShares';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import * as constants from '../utils/Constants'
import { to_d18 } from '../utils/Helpers';
import { BdStablePool } from '../typechain/BdStablePool';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = (await hre.getNamedAccounts()).DEPLOYER_ADDRESS;

  //todo: extract into separate file
  const bdPoolLibraryDeployment = await hre.deployments.deploy('BdPoolLibrary', {
    from: deployer
  });

  const bdx = await hre.ethers.getContract('BDXShares', deployer) as BDXShares;

  const bdeur_proxy = await hre.deployments.deploy('BDEUR', {
    from: deployer,
    proxy: {
      proxyContract: 'OptimizedTransparentProxy',
      execute: {
        init: {
          methodName: "initialize",
          args: [
            'BlindexEuro',
            'BDEUR',
            'EURO',
            deployer,
            bdx.address,
            constants.initalBdStableToOwner_d18[hre.network.name]
          ]
        }
      }
    },
    contract: 'BDStable',
    args: []
  });

  const bdEur = await hre.ethers.getContract('BDEUR') as BDStable;

  console.log("BDEUR deployed to:", bdEur.address);
  
  const bdeur_weth_BdStablePoolDeployment = await hre.deployments.deploy(
    'BDEUR_WETH_POOL', 
    {
      from: deployer,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdEur.address,
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
  
  const bdeur_weth_BdStablePool = await hre.ethers.getContract('BDEUR_WETH_POOL') as BdStablePool;

  console.log("BDEUR WETH Pool deployed to:", bdeur_weth_BdStablePool.address);
  
  const bdeur_wbtc_BdStablePoolDeployment = await hre.deployments.deploy(
    'BDEUR_WBTC_POOL', 
    {
      from: deployer,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdEur.address,
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

  const bdeur_wbtc_BdStablePool = await hre.ethers.getContract('BDEUR_WBTC_POOL') as BdStablePool;
  
  console.log("BDEUR WBTC Pool deployed to:", bdeur_wbtc_BdStablePool.address);

  await (await bdEur.addPool(bdeur_weth_BdStablePool.address)).wait()
  await (await bdEur.addPool(bdeur_wbtc_BdStablePool.address)).wait()

  await (await bdx.addBdStableAddress(bdEur.address)).wait()

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['BDEUR'];
func.dependencies = ['BDX'];
export default func;