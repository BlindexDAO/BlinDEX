import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import { BigNumber } from 'ethers';
import { StakingRewards } from '../typechain/StakingRewards';

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"; // todo ag

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [ deployer ] = await hre.ethers.getSigners();
  
  const bdeur = await hre.deployments.get('BDEUR');
  const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

  const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as unknown as UniswapV2Factory;
  const pairAddress = await uniswapFactoryContract.getPair(bdeur.address, WETH_ADDRESS); 

  const StakingRewards_BDEUR_WETH = await hre.deployments.deploy('StakingRewards_BDEUR_WETH', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "StakingRewards",
    args: [deployer.address, bdx.address, pairAddress, hre.ethers.constants.AddressZero, 1e6, false]
  });

  const stakingRewards_BDEUR_WETH = await hre.ethers.getContract("StakingRewards_BDEUR_WETH") as unknown as StakingRewards;
  stakingRewards_BDEUR_WETH.initializeDefault(); // todo ag use proxy instead

  await bdx.connect((await hre.ethers.getNamedSigner("COLLATERAL_FRAX_AND_FXS_OWNER"))).transfer(
    StakingRewards_BDEUR_WETH.address,
    BigNumber.from(21).mul(BigNumber.from(10).pow(6+18)).div(2));

  console.log("StakingRewards deployed to:", StakingRewards_BDEUR_WETH.address);

  console.log("Bdx shares connected with StakingRewards");

	// One time migration
	return true;
};
func.id = __filename
export default func;