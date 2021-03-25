import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.getUnnamedAccounts();
  const bdx = await hre.deployments.get('BDXShares')
  const bdeur = await hre.deployments.deploy('BDEUR', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: 'BDStable',
    args: ['BlindexEuro', 'BDEUR', 'EURO', deployer, bdx.address]
  });

  console.log("BDEUR deployed to:", bdeur.address);

	// One time migration
	return true;
};
func.id = __filename
export default func;