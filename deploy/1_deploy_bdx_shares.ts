import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';
import { BigNumber } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.ethers.getSigners();
  const bdx = await hre.deployments.deploy('BDXShares', {
    from: deployer.address,
    args: ['BDXShares', 'BDX', '0x0000000000000000000000000000000000000000', deployer.address],
    // deterministicDeployment: true
  });

  console.log("BDXShares deployed to:", bdx.address);

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['BDX'];
func.dependencies = [];
export default func;