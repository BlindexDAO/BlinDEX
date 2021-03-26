import { BDStable } from './../typechain/BDStable.d';
import { BDXShares } from './../typechain/BDXShares.d';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = (await hre.getNamedAccounts()).DEPLOYER_ADDRESS;
  const wETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'; //todo ag
  const bdx = await hre.deployments.get('BDXShares')
  const bdeurDeployment = await hre.deployments.deploy('BDEUR', {
    from: deployer,
    contract: 'BDStable',
    args: ['BlindexEuro', 'BDEUR', 'EURO', deployer, bdx.address]
  });
  const bdeur_weth_BdStablePoolDeployment = await hre.deployments.deploy('BDEUR_WETH_POOL', {
    from: deployer,
    contract: 'BdStablePool',
    args: [bdeurDeployment.address, bdx.address, wETH, deployer]
  });
  console.log("BDEUR deployed to:", bdeurDeployment.address);
  const bdeur = await hre.ethers.getContract('BDEUR') as unknown as BDStable;
  await bdeur.addPool(bdeur_weth_BdStablePoolDeployment.address)
	// One time migration
	return true;
};
func.id = __filename
export default func;