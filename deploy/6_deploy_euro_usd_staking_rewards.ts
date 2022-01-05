import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import type { UniswapV2Factory } from "../typechain/UniswapV2Factory";
import * as constants from "../utils/Constants";
import type { StakingRewardsDistribution } from "../typechain/StakingRewardsDistribution";
import { formatAddress, getBdEu, getBdUs, getBdx, getDeployer } from "../utils/DeployedContractsHelpers";
import { getPoolKey } from "../utils/UniswapPoolsHelpers";

async function setupStakingContract(
  hre: HardhatRuntimeEnvironment,
  addressA: string,
  addressB: string,
  nameA: string,
  nameB: string,
  isTrueBdPool: boolean
) {
  const poolKey = getPoolKey(addressA, addressB, nameA, nameB);

  console.log(`Setting up staking: ${poolKey}`);

  const deployer = await getDeployer(hre);
  const uniswapFactoryContract = (await hre.ethers.getContract("UniswapV2Factory")) as UniswapV2Factory;
  const pairAddress = await uniswapFactoryContract.getPair(addressA, addressB);

  const stakingRewardsContractName = `StakingRewards_${poolKey}`;
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

  await setupStakingContract(hre, bdx.address, formatAddress(hre, constants.wETH_address[networkName]), "BDX", "WETH", false);
  await setupStakingContract(hre, bdx.address, formatAddress(hre, constants.wBTC_address[networkName]), "BDX", "WBTC", false);

  const bdEu = await getBdEu(hre);
  const bdUs = await getBdUs(hre);
  const stables = [bdEu, bdUs];

  for (const stable of stables) {
    const symbol = await stable.symbol();
    console.log(`Starting deployment of ${symbol} staking contracts`);

    await setupStakingContract(hre, bdx.address, stable.address, "BDX", symbol, true);
    await setupStakingContract(hre, stable.address, formatAddress(hre, constants.wETH_address[networkName]), symbol, "WETH", false);
    await setupStakingContract(hre, stable.address, formatAddress(hre, constants.wBTC_address[networkName]), symbol, "WBTC", false);

    console.log(`Finished deployment of ${symbol} staking contracts`);
  }

  await setupStakingContract(hre, bdEu.address, bdUs.address, "BDEU", "BDUS", true);
  console.log(`Finished deployment of BDEU/BDUS staking contracts`);

  console.log("Finished deployment of all the staking contracts");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["StakingRewards"];
func.dependencies = ["LiquidityPools", "StakingRewardsDistribution", "Vesting"];
export default func;
