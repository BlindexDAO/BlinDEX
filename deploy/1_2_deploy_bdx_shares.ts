import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = (await hre.getNamedAccounts()).DEPLOYER_ADDRESS;
  const bdx_proxy = await hre.deployments.deploy(
    'BDXShares', 
    {
      from: deployer,
      proxy: {
        proxyContract: 'OptimizedTransparentProxy',
      },
      contract: 'BDXShares',
      args: []
    }
  );

  const bdx = await hre.ethers.getContract("BDXShares") as BDXShares;

  await bdx.initialize(
    'BDXShares',
    'BDX',
    deployer
  );

  console.log("BDXShares deployed to:", bdx_proxy.address);

	// One time migration
	return true;
};
func.id = __filename
func.tags = ['BDX'];
func.dependencies = [];
export default func;