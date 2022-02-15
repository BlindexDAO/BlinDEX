import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { getDeployer, getUniswapFactory } from "../utils/DeployedContractsHelpers";
import { getPoolKey, sortUniswapPairTokens } from "../utils/UniswapPoolsHelpers";
import type { UniswapV2Factory } from "../typechain/UniswapV2Factory";
import type { StakingRewardsDistribution } from "../typechain/StakingRewardsDistribution";

export async function deployPairOracle(hre: HardhatRuntimeEnvironment, nameA: string, nameB: string, addressA: string, addressB: string) {
  const deployer = await getDeployer(hre);
  const uniswapFactory = await getUniswapFactory(hre);

  const sortedTokens = sortUniswapPairTokens(addressA, addressB, nameA, nameB);
  const poolKey = getPoolKey(addressA, addressB, nameA, nameB);

  await hre.deployments.deploy(`UniswapPairOracle_${poolKey}`, {
    from: deployer.address,
    contract: "UniswapPairOracle",
    args: [uniswapFactory.address, sortedTokens.token0Address, sortedTokens.token1Address]
  });

  console.log(`Created ${poolKey} liquidity pool pair`);
}

export async function setupStakingContract(
  hre: HardhatRuntimeEnvironment,
  addressA: string,
  addressB: string,
  nameA: string,
  nameB: string,
  isTrueBdPool: boolean,
  poolWeight = 1e6
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

  await (await stakingRewardsDistribution.connect(deployer).registerPools([<string>stakingRewards_ProxyDeployment.address], [poolWeight])).wait();
  console.log("registered staking rewards pool to staking rewards distribution");
}
