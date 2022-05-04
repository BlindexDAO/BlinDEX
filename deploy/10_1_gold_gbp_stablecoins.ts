import type { BDStable } from "../typechain/BDStable";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../utils/Constants";
import type { BdStablePool } from "../typechain/BdStablePool";
import { bdStablesContractsDetails, formatAddress, getBdx, getDeployer, getTreasury } from "../utils/DeployedContractsHelpers";
import { to_d12 } from "../utils/NumbersHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const initialDeployBDStables = Object.values(bdStablesContractsDetails).filter(stableDetails => ["bXAU", "bGBP"].includes(stableDetails.symbol));
  for (const stableDetails of initialDeployBDStables) {
    console.log(`Starting deployment: ${stableDetails.fiat} stable - ${stableDetails.symbol}`);

    const deployer = await getDeployer(hre);
    const treasuryAddress = hre.network.name === "rsk" ? constants.multisigTreasuryAddress[hre.network.name] : (await getTreasury(hre)).address;
    const bdx = await getBdx(hre);
    const bdPoolLibraryDeployment = await hre.ethers.getContract("BdPoolLibrary");

    await hre.deployments.deploy(stableDetails.symbol, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        execute: {
          init: {
            methodName: "initialize",
            args: [
              stableDetails.name,
              stableDetails.symbol,
              treasuryAddress,
              bdx.address,
              constants.initialBdstableMintingAmount(hre.network.name, stableDetails.symbol)
            ]
          }
        }
      },
      contract: "BDStable",
      args: []
    });

    const bdstable = (await hre.ethers.getContract(stableDetails.symbol)) as BDStable;
    console.log(`${stableDetails.symbol} deployed to:`, bdstable.address);

    await hre.deployments.deploy(stableDetails.pools.weth.name, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdstable.address,
              bdx.address,
              formatAddress(hre, constants.wrappedNativeTokenData[hre.network.name].address),
              constants.wrappedNativeTokenData[hre.network.name].decimals,
              true
            ]
          }
        }
      },
      contract: "BdStablePool",
      args: [],
      libraries: {
        BdPoolLibrary: bdPoolLibraryDeployment.address
      }
    });

    const bdstable_weth_BdStablePool = (await hre.ethers.getContract(stableDetails.pools.weth.name)) as BdStablePool;
    console.log(`${stableDetails.pools.weth.name} pool deployed to:`, bdstable_weth_BdStablePool.address);

    console.log(`Set ${stableDetails.pools.weth.name} pool parameters`);
    const [weth_pool_ceiling, weth_redemption_delay, weth_minting_fee, weth_redemption_fee, weth_buyback_fee, weth_recollat_fee] = await Promise.all([
      bdstable_weth_BdStablePool.pool_ceiling(),
      bdstable_weth_BdStablePool.redemption_delay(),
      bdstable_weth_BdStablePool.minting_fee(),
      bdstable_weth_BdStablePool.redemption_fee(),
      bdstable_weth_BdStablePool.buyback_fee(),
      bdstable_weth_BdStablePool.recollat_fee()
    ]);
    await (
      await bdstable_weth_BdStablePool.setPoolParameters(
        weth_pool_ceiling,
        to_d12(0.03), // 3% Bonus rate
        weth_redemption_delay,
        weth_minting_fee,
        weth_redemption_fee,
        weth_buyback_fee,
        weth_recollat_fee
      )
    ).wait();

    await hre.deployments.deploy(stableDetails.pools.wbtc.name, {
      from: deployer.address,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        execute: {
          init: {
            methodName: "initialize",
            args: [
              bdstable.address,
              bdx.address,
              formatAddress(hre, constants.wrappedSecondaryTokenData[hre.network.name].address),
              constants.wrappedSecondaryTokenData[hre.network.name].decimals,
              false
            ]
          }
        }
      },
      contract: "BdStablePool",
      args: [],
      libraries: {
        BdPoolLibrary: bdPoolLibraryDeployment.address
      }
    });

    const bdstable_wbtc_BdStablePool = (await hre.ethers.getContract(stableDetails.pools.wbtc.name)) as BdStablePool;
    console.log(`${stableDetails.pools.wbtc.name} pool deployed to:`, bdstable_wbtc_BdStablePool.address);

    console.log(`Set ${stableDetails.pools.wbtc.name} pool parameters`);
    const [wbtc_pool_ceiling, wbtc_redemption_delay, wbtc_minting_fee, wbtc_redemption_fee, wbtc_buyback_fee, wbtc_recollat_fee] = await Promise.all([
      bdstable_wbtc_BdStablePool.pool_ceiling(),
      bdstable_wbtc_BdStablePool.redemption_delay(),
      bdstable_wbtc_BdStablePool.minting_fee(),
      bdstable_wbtc_BdStablePool.redemption_fee(),
      bdstable_wbtc_BdStablePool.buyback_fee(),
      bdstable_wbtc_BdStablePool.recollat_fee()
    ]);
    await (
      await bdstable_wbtc_BdStablePool.setPoolParameters(
        wbtc_pool_ceiling,
        to_d12(0.03), // 3% Bonus rate
        wbtc_redemption_delay,
        wbtc_minting_fee,
        wbtc_redemption_fee,
        wbtc_buyback_fee,
        wbtc_recollat_fee
      )
    ).wait();

    // TODO: Enable this on rsk once we have a solution for running multisig tasks
    if (hre.network.name === "mainnetFork") {
      const treasury = await getTreasury(hre);
      await (await bdx.connect(treasury).transfer(bdstable.address, constants.INITIAL_BDX_AMOUNT_FOR_BDSTABLE)).wait();
      console.log(`${stableDetails.symbol} provided with BDX`);
    }

    await (await bdstable.addPool(bdstable_weth_BdStablePool.address)).wait();
    console.log(`added ${stableDetails.pools.weth.name} pool`);

    await (await bdstable.addPool(bdstable_wbtc_BdStablePool.address)).wait();
    console.log(`added ${stableDetails.pools.wbtc.name} pool`);

    await (await bdx.addBdStableAddress(bdstable.address)).wait();
    console.log(`${stableDetails.symbol} address set in the BDX contract`);

    console.log(`Finished deployment: ${stableDetails.fiat} stable - ${stableDetails.symbol}`);
  }

  // One time migration
  return true;
};

func.id = __filename;
func.tags = ["bXAU", "bGBP"];
func.dependencies = ["BDX", "BdPoolLibrary", "BDUS_XUSD_POOL"];
export default func;
