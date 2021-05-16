import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.ethers.getSigners();
  const bdx = await hre.deployments.deploy('BDXShares', {
    from: deployer.address,
    args: [
      'BDXShares',
      'BDX',
      deployer.address
    ]
  });

  console.log("BDXShares deployed to:", bdx.address);

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['BDX'];
func.dependencies = [];
export default func;