import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = (await hre.getNamedAccounts()).DEPLOYER;

  const bdx_proxy = await hre.deployments.deploy(
    'BDXShares', 
    {
      from: deployer,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [
              'BDXShares',
              'BDX',
              deployer
            ]
          }
        }
      },
      contract: 'BDXShares',
      args: []
    }
  );

  console.log("BDXShares deployed to:", bdx_proxy.address);

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['BDX'];
func.dependencies = [];
export default func;