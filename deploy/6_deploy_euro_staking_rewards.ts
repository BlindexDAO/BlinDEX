import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { BDXShares } from "../typechain/BDXShares";
import { UniswapV2Factory } from "../typechain/UniswapV2Factory";
import * as constants from "../utils/Constants";
import { StakingRewardsDistribution } from "../typechain/StakingRewardsDistribution";
import { Vesting } from "../typechain/Vesting";
import { getBdEu, getBdx } from "../utils/DeployedContractsHelpers";

async function setupStakingContract(
  hre: HardhatRuntimeEnvironment,
  addressA: string,
  addressB: string,
  nameA: string,
  nameB: string,
  isTrueBdPool: boolean
) {
  console.log("starting deployment: euro staking");

  const deploerAddersss = (await hre.getNamedAccounts()).DEPLOYER;
  const deployer = await hre.ethers.getSigner(deploerAddersss);
  const uniswapFactoryContract = (await hre.ethers.getContract("UniswapV2Factory")) as UniswapV2Factory;
  const pairAddress = await uniswapFactoryContract.getPair(addressA, addressB);

  const stakingRewardsContractName = `StakingRewards_${nameA}_${nameB}`;
  const stakingRewardsDistribution = (await hre.ethers.getContract("StakingRewardsDistribution")) as StakingRewardsDistribution;

  const stakingRewards_ProxyDeployment = await hre.deployments.deploy(stakingRewardsContractName, {
    from: deploerAddersss,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [pairAddress, stakingRewardsDistribution.address, isTrueBdPool],
        },
      },
    },
    contract: "StakingRewards",
    args: [],
  });

  console.log(`${stakingRewardsContractName} deployed to proxy:`, stakingRewards_ProxyDeployment.address);

  await (await stakingRewardsDistribution.connect(deployer).registerPools([<string>stakingRewards_ProxyDeployment.address], [1e6])).wait();
  console.log("redistered staking rewards pool to staking rewards distribution");
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkName = hre.network.name;

  const bdeu = await getBdEu(hre);
  const bdx = await getBdx(hre);

  console.log("Setting up staking contracts");

  await setupStakingContract(hre, bdx.address, constants.wETH_address[networkName], "BDX", "WETH", false);
  console.log("Set up statking: BDX/WETH");

  await setupStakingContract(hre, bdx.address, constants.wBTC_address[networkName], "BDX", "WBTC", false);
  console.log("Set up statking: BDX/WBTC");

  await setupStakingContract(hre, bdx.address, bdeu.address, "BDX", "BDEU", true);
  console.log("Set up statking: BDX/BDEU");

  await setupStakingContract(hre, bdeu.address, constants.wETH_address[networkName], "BDEU", "WETH", false);
  console.log("Set up statking: BDEU/WETH");

  await setupStakingContract(hre, bdeu.address, constants.wBTC_address[networkName], "BDEU", "WBTC", false);
  console.log("Set up statking: BDEU/WBTC");

  console.log("finished deployment: euro stable staking");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["StakingRewards"];
func.dependencies = ["LiquidityPools", "StakingRewardsDistribution", "Vesting"];
export default func;
