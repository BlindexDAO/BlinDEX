import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { UniswapV2Factory } from "../typechain/UniswapV2Factory";
import * as constants from "../utils/Constants";
import { StakingRewardsDistribution } from "../typechain/StakingRewardsDistribution";
import { getAllBDStables, getBdx, getDeployer } from "../utils/DeployedContractsHelpers";

async function setupStakingContract(
  hre: HardhatRuntimeEnvironment,
  addressA: string,
  addressB: string,
  nameA: string,
  nameB: string,
  isTrueBdPool: boolean
) {
  console.log(`Setting up staking: ${nameA}/${nameB}`);

  const deployer = await getDeployer(hre);
  const uniswapFactoryContract = (await hre.ethers.getContract("UniswapV2Factory")) as UniswapV2Factory;
  const pairAddress = await uniswapFactoryContract.getPair(addressA, addressB);

  const stakingRewardsContractName = `StakingRewards_${nameA}_${nameB}`;
  const stakingRewardsDistribution = (await hre.ethers.getContract("StakingRewardsDistribution")) as StakingRewardsDistribution;

  const stakingRewards_ProxyDeployment = await hre.deployments.deploy(stakingRewardsContractName, {
    from: deployer.address,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [pairAddress, stakingRewardsDistribution.address, isTrueBdPool]
        }
      }
    },
    contract: "StakingRewards",
    args: []
  });

  console.log(`${stakingRewardsContractName} deployed to proxy:`, stakingRewards_ProxyDeployment.address);

  await (await stakingRewardsDistribution.connect(deployer).registerPools([<string>stakingRewards_ProxyDeployment.address], [1e6])).wait();
  console.log("redistered staking rewards pool to staking rewards distribution");
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkName = hre.network.name;

  const bdx = await getBdx(hre);

  console.log("Setting up staking contracts");

  await setupStakingContract(hre, bdx.address, constants.wETH_address[networkName], "BDX", "WETH", false);
  await setupStakingContract(hre, bdx.address, constants.wBTC_address[networkName], "BDX", "WBTC", false);

  for (const stable of await getAllBDStables(hre)) {
    const symbol = await stable.symbol();
    console.log(`Starting deployment of ${symbol} staking contracts`);

    await setupStakingContract(hre, bdx.address, stable.address, "BDX", symbol, true);
    await setupStakingContract(hre, stable.address, constants.wETH_address[networkName], symbol, "WETH", false);
    await setupStakingContract(hre, stable.address, constants.wBTC_address[networkName], symbol, "WBTC", false);

    console.log(`Finished deployment of ${symbol} staking contracts`);
  }

  console.log("Finished deployment of all the staking contracts");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["StakingRewards"];
func.dependencies = ["LiquidityPools", "StakingRewardsDistribution", "Vesting"];
export default func;
