import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, bdStablesContractsDetails, getStakingRewardsDistribution } from "../../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "rsk") {
    // no reason to run this script locally (it would have no effect at all and would slow down tests)
    console.log("Skipping starting deployment: introduce emergency executor");
    return;
  }

  console.log("starting deployment: introduce emergency executor");

  const deployer = await getDeployer(hre);

  const initialDeployBDStables = Object.values(bdStablesContractsDetails).filter(stableDetails =>
    ["BDEU", "BDUS", "bXAU", "bGBP"].includes(stableDetails.symbol)
  );
  for (const stableDetails of initialDeployBDStables) {
    console.log(`Upgrading bdStable: ${stableDetails.name}`);

    await hre.deployments.deploy(stableDetails.symbol, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy"
      },
      contract: "BDStable"
    });

    for (const poolName of [stableDetails.pools.weth.name, stableDetails.pools.wbtc.name]) {
      console.log(`Upgrading bdStablePool: ${poolName}`);

      await hre.deployments.deploy(poolName, {
        from: deployer.address,
        proxy: {
          proxyContract: "OptimizedTransparentProxy"
        },
        contract: "BdStablePool",
        libraries: {
          BdPoolLibrary: (await hre.ethers.getContract("BdPoolLibrary")).address
        }
      });
    }
  }

  console.log(`Upgrading staking rewards distribution`);
  await hre.deployments.deploy("StakingRewardsDistribution", {
    from: deployer.address,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      execute: {
        methodName: "onUpgrade",
        args: []
      }
    },
    contract: "StakingRewardsDistribution"
  });

  console.log(`Fixing duplicates in staking rewards`);

  // this part is a little complex, we start with ("*" marks latter duplicates):
  //
  // 0x4b9A981B32904C3B5e0A468528035B7DE4461cdf 2000000
  // 0x314cb69F6463e1289F0dB95A525B1a6D1eE4e428 1000000
  // 0x051c9D1E376a7e4230562656D19DF6AD12900E5f 1000000
  // 0xeFaCb88E4f5bF53F13F74D267E853099CE89ac4C 1000000
  // 0x6a804de5D61fD6CFf8061214aBbc8Ce75463cf5b 1000000
  // 0xDaA561E04D0e73808B1A430FB360d3e497DE52c2 1000000
  // 0xC237ccD60b386617CAF5EF4ca415CD789461Dec0 1000000
  // 0x67E795c3ebCd0d26225cD1582af90B590f5Ade54 1000000
  // 0x4d97F81C75a28763e858a109AC19933027aF3684 1000000
  // 0x750159AC3854ebb58bcE36c3Acbb4148eF7bE14A 800000
  // 0x750159AC3854ebb58bcE36c3Acbb4148eF7bE14A 800000*
  // 0x8e9E851136534BF9B3C91B723Adf900e9e3474cf 1000000
  // 0x892511BB403150e01587Bc194aCC0342590530Ec 1000000
  // 0xEAB5B0774D0288724aFD44E6042aC32079Ed99e8 1000000
  // 0x08b4580f9262aB46aff69fa1d45BD4a290737c75 1000000
  // 0x8e9E851136534BF9B3C91B723Adf900e9e3474cf 1000000*
  // 0x892511BB403150e01587Bc194aCC0342590530Ec 1000000*
  // 0xEAB5B0774D0288724aFD44E6042aC32079Ed99e8 1000000*
  // 0x08b4580f9262aB46aff69fa1d45BD4a290737c75 1000000*
  // 0x2Dfa7eC7655c373Ae1Fc6E8b96B5710bD88bD31D 1000000
  // 0x2Dfa7eC7655c373Ae1Fc6E8b96B5710bD88bD31D 1000000*
  //
  // the latter duplicate is always replaced with the last element in the array
  // then the last element is popped from the array
  // this is why we use the same indices in subsequent removeDuplicatePool() calls

  const srd = await getStakingRewardsDistribution(hre);
  await (await srd.removeDuplicatePool(10, 11)).wait();
  await (await srd.removeDuplicatePool(11, 20)).wait();
  await (await srd.removeDuplicatePool(12, 16)).wait();
  await (await srd.removeDuplicatePool(15, 16)).wait();
  await (await srd.removeDuplicatePool(14, 16)).wait();
  await (await srd.removeDuplicatePool(13, 16)).wait();

  console.log(`Upgrading staking rewards`);

  // We want to be very explicit. These very pools need too be upgraded
  const rskStakingRewardsToUpgrade = [
    "StakingRewards_WRBTC_BDX",
    "StakingRewards_ETHS_BDX",
    "StakingRewards_WRBTC_BDEU",
    "StakingRewards_ETHS_BDEU",
    "StakingRewards_BDX_BDEU",
    "StakingRewards_BDEU_BDUS",
    "StakingRewards_WRBTC_BDUS",
    "StakingRewards_ETHS_BDUS",
    "StakingRewards_BDX_BDUS",
    "StakingRewards_BDUS_XUSD",
    "StakingRewards_WRBTC_BXAU",
    "StakingRewards_BDX_BXAU",
    "StakingRewards_BGBP_WRBTC",
    "StakingRewards_BGBP_BDX",
    "StakingRewards_BDUS_DOC"
  ];

  for (const stakingRewardPoolName of rskStakingRewardsToUpgrade) {
    console.log(`Upgrading staking rewards: ${stakingRewardPoolName}`);

    await hre.deployments.deploy(stakingRewardPoolName, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy"
      },
      contract: "StakingRewards"
    });
  }

  console.log(`Upgrading vesting`);
  await hre.deployments.deploy("Vesting", {
    from: deployer.address,
    proxy: {
      proxyContract: "OptimizedTransparentProxy"
    },
    contract: "Vesting"
  });

  console.log("finished deployment: introduce emergency executor");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["EmergencyExecutor"];
func.dependencies = ["Timelock"];
export default func;
