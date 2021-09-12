import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
const deployer = (await hre.getNamedAccounts()).DEPLOYER;

  const bdPoolLibraryDeployment = await hre.deployments.deploy('BdPoolLibrary', {
    from: deployer
  });

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['BdPoolLibrary'];
func.dependencies = ['BDX'];
export default func;