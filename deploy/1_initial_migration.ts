
import hre from 'hardhat';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  
  const Migrations = await hre.ethers.getContractFactory("contracts/Utils/Migrations.sol:Migrations");
  const migrations = await Migrations.deploy();

  await migrations.deployed();

  console.log("Migrations deployed to:", migrations.address);
};
export default func;