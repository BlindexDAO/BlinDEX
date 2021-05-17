import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.ethers.getSigners();
  const timelock = await hre.deployments.deploy('Timelock', {
    from: deployer.address,
    args: [
      deployer.address,
      60*60*24*14 // 2 weeks delay
    ]
  });

  console.log("Timelock deployed to:", timelock.address);

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['Timelock'];
func.dependencies = [];
export default func;