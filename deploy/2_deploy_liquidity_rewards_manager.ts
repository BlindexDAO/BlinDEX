import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.getUnnamedAccounts();
  const bdx = await hre.deployments.get('BDXShares')
  const rewardsManager = await hre.deployments.deploy('LiquidityRewardsManager', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    args: [bdx.address, Date.now()]
  });

  console.log("LiquidityRewardsManager deployed to:", rewardsManager.address);

  const bdxSharesContract = await hre.ethers.getContract('BDXShares') as unknown as BDXShares;
  await bdxSharesContract.setLiquidityRewardsManagerAddress(rewardsManager.address);

  console.log("Bdx shares connected with LiquidityRewardsManager");

	// One time migration
	return true;
};
func.id = __filename
export default func;