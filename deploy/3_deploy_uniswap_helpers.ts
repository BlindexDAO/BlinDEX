import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../utils/Constants";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting deployment: uniswap helpers");

  const deployer = (await hre.getNamedAccounts()).DEPLOYER;

  const uniswapV2Factory = await hre.deployments.deploy("UniswapV2Factory", {
    from: deployer,
    args: [deployer]
  });

  console.log("UniswapV2Factory deployed to:", uniswapV2Factory.address);

  const uniswapV2Router02 = await hre.deployments.deploy("UniswapV2Router02", {
    from: deployer,
    args: [uniswapV2Factory.address, constants.wETH_address[hre.network.name]]
  });

  console.log("UniswapV2Router02 deployed to:", uniswapV2Router02.address);

  console.log("finished deployment: uniswap helpers");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["UniswapHelpers"];
func.dependencies = [];
export default func;
