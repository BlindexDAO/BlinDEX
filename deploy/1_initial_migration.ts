import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  
  const Migrations = await hre.ethers.getContractFactory("contracts/Utils/Migrations.sol:Migrations");
  const migrations = await hre.deployments.deploy('Migrations', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
  });

  console.log("Migrations deployed to:", migrations.address);

	// One time migration
	return true;
};
func.id = __filename
export default func;