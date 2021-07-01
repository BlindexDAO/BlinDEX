import { BDStable } from '../typechain/BDStable';
import { BDXShares } from '../typechain/BDXShares';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import * as constants from '../utils/Constants'
import { to_d18 } from '../utils/Helpers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = (await hre.getNamedAccounts()).DEPLOYER_ADDRESS;

  //todo: extract into separate file
  const bdPoolLibraryDeployment = await hre.deployments.deploy('BdPoolLibrary', {
    from: deployer
  });

  const bdx = await hre.ethers.getContract('BDXShares', deployer) as unknown as BDXShares;


  const bdeurDeployment = await hre.deployments.deploy('BDEUR', {
    from: deployer,
    contract: 'BDStable',
    args: ['BlindexEuro', 'BDEUR', 'EURO', deployer, bdx.address, constants.initalBdStableToOwner_d18]
  });

  console.log("BDEUR deployed to:", bdeurDeployment.address);
  
  const bdeur_weth_BdStablePoolDeployment = await hre.deployments.deploy('BDEUR_WETH_POOL', {
    from: deployer,
    contract: 'BdStablePool',
    args: [bdeurDeployment.address, bdx.address, constants.wETH_address[hre.network.name], deployer],
    libraries: {
      BdPoolLibrary: bdPoolLibraryDeployment.address
    }
  });
  
  console.log("BDEUR WETH Pool deployed to:", bdeur_weth_BdStablePoolDeployment.address);

  
  const bdeur_wbtc_BdStablePoolDeployment = await hre.deployments.deploy('BDEUR_WBTC_POOL', {
    from: deployer,
    contract: 'BdStablePool',
    args: [bdeurDeployment.address, bdx.address, constants.wBTC_address[hre.network.name], deployer],
    libraries: {
      BdPoolLibrary: bdPoolLibraryDeployment.address
    }
  });
  
  console.log("BDEUR WBTC Pool deployed to:", bdeur_wbtc_BdStablePoolDeployment.address);

  const bdeur = await hre.ethers.getContract('BDEUR') as unknown as BDStable;
  await (await bdeur.addPool(bdeur_weth_BdStablePoolDeployment.address)).wait()
  await (await bdeur.addPool(bdeur_wbtc_BdStablePoolDeployment.address)).wait()

  await (await bdx.setBdStableAddress(bdeurDeployment.address)).wait()

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['BDEUR'];
func.dependencies = ['BDX'];
export default func;