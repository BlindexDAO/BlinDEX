import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: bdx");

  const deployer = (await hre.getNamedAccounts()).DEPLOYER;

  const bdx_proxy = await hre.deployments.deploy(
    'BDX', 
    {
      from: deployer,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
        execute: {
          init: {
            methodName: "initialize",
            args: [
              'BlindexShares',
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

  console.log("BDX deployed to:", bdx_proxy.address);

  console.log("finished deployment: bdx");
  
	// One time migration
	return true;
};
func.id = __filename
func.tags = ['BDX'];
func.dependencies = [];
export default func;