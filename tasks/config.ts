import { task } from "hardhat/config";
import {
  getBdx,
  getDeployer,
  getStakingRewardsDistribution,
  getUniswapFactory,
  getUniswapRouter,
  getVesting,
  getWeth,
  getBDStableWethPool,
  getBDStableWbtcPool,
  getBDStableFiat,
  getAllBDStables
} from "../utils/DeployedContractsHelpers";
import type { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { d12_ToNumber } from "../utils/NumbersHelpers";
import type { BdStablePool } from "../typechain/BdStablePool";
import type { StakingRewards } from "../typechain/StakingRewards";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { ContractsNames as PriceFeedContractNames } from "../deploy/7_deploy_price_feeds";
import { cleanStringify } from "../utils/StringHelpers";
import type { BDStable } from "../typechain/BDStable";
import { getPools } from "../utils/UniswapPoolsHelpers";

export function load() {
  task("show:be-config").setAction(async (args, hre) => {
    const deployer = await getDeployer(hre);
    const swaps = await getSwapsConfig(hre);
    const stakingRewards = (await getStakingsConfig(hre, swaps)).map((reward) => {
      return { pairAddress: reward.stakingTokenAddress.toLowerCase(), stakingRewardAddress: reward.address.toLowerCase() };
    });

    const { pairs, pairOracles, pairSymbols } = await getPairsOraclesAndSymbols(hre, deployer);

    const swapPairs = pairs.map((pair) => {
      return {
        pairAddress: pair.address.toLowerCase(),
        token0Address: pair.token0.toLowerCase(),
        token1Address: pair.token1.toLowerCase()
      };
    });

    const mappedPairOracles = pairOracles.map((pairOracle) => {
      return { pairAddress: pairOracle.pairAddress.toLowerCase(), oracleAddress: pairOracle.oracleAddress.toLowerCase() };
    });
    const networkName = hre.network.name.toUpperCase();

    const blockchainConfig = {
      [`${networkName}_UNISWAP_FACTORY_ADDRESS`]: (await getUniswapFactory(hre)).address.toLowerCase(),
      [`${networkName}_BDX_ADDRESS`]: (await getBdx(hre)).address.toLowerCase(),
      [`${networkName}_STAKING_REWARDS_DISTRIBUTION_ADDRESS`]: (await getStakingRewardsDistribution(hre)).address.toLowerCase(),
      [`${networkName}_AVAILABLE_PAIR_SYMBOLS`]: pairSymbols,
      [`${networkName}_AVAILABLE_PAIRS`]: swapPairs,
      [`${networkName}_STAKING_REWARDS`]: stakingRewards,
      [`${networkName}_PAIR_ORACLES`]: mappedPairOracles,
      [`${networkName}_PRICE_FEEDS`]: {
        ["EUR_USD_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.priceFeedEurUsdName, deployer)).address.toLowerCase(),
        ["BTC_ETH_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.BtcToEthOracle, deployer)).address.toLowerCase(),
        ["ETH_USD_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.priceFeedETHUsdName, deployer)).address.toLowerCase(),
        ["ETH_EUR_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.oracleEthEurName, deployer)).address.toLowerCase()
      },
      [`${networkName}_UPDATER_RSK_ADDRESS`]: (await hre.ethers.getContract("UpdaterRSK", deployer)).address.toLowerCase(),
      [`${networkName}_BDSTABLES`]: await Promise.all(
        (
          await getAllBDStables(hre)
        ).map(async (stable: BDStable) => {
          return { symbol: await stable.symbol(), address: stable.address };
        })
      )
    };

    console.log(
      "Please make sure to run hardhat with the appropriate network you wanted to get the BE configuration for (npx hardhat --network <network_name> show:be-config)\n"
    );
    console.log(cleanStringify(blockchainConfig));
  });

  task("show:fe-config").setAction(async (args, hre) => {
    const deployer = await getDeployer(hre);
    const allStables = await getAllBDStables(hre);
    const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);

    const stables = await getStablesConfig(hre);
    const swaps = await getSwapsConfig(hre);
    const stakings = await getStakingsConfig(hre, swaps);

    const blockchainConfig = {
      STABLES: stables,
      SWAPS: swaps,
      STAKING_REWARDS: stakings,
      WETH: (await getWeth(hre)).address,
      BDX: (await getBdx(hre)).address,
      SWAP_ROUTER: (await getUniswapRouter(hre)).address,
      SWAP_FACTORY: (await getUniswapFactory(hre)).address,
      STAKING_REWARDS_DISTRIBUTION: stakingRewardsDistribution.address,
      VESTING: (await getVesting(hre)).address,
      BD_STABLES: allStables.map((stable: BDStable) => stable.address),
      PRICE_FEED_EUR_USD: (await hre.ethers.getContract(PriceFeedContractNames.priceFeedEurUsdName, deployer)).address,
      BTC_TO_ETH_ORACLE: (await hre.ethers.getContract(PriceFeedContractNames.BtcToEthOracle, deployer)).address
    };

    console.log(cleanStringify(blockchainConfig));
  });
}

async function getPairsOraclesAndSymbols(
  hre: HardhatRuntimeEnvironment,
  deployer: SignerWithAddress
): Promise<{
  pairs: { address: string; token0: string; token1: string }[];
  pairOracles: { pairAddress: string; oracleAddress: string }[];
  pairSymbols: string[];
}> {
  const factory = await getUniswapFactory(hre);
  const pools = await getPools(hre);

  const pairInfos: {
    pair: { address: string; token0: string; token1: string };
    pairOracle: { pairAddress: string; oracleAddress: string };
    symbol: string;
  }[] = [];
  for (const poolPair of pools) {
    let pairSymbol: string;
    let oracleAddress: string;
    let pairAddress: string;

    try {
      pairSymbol = poolPair[0].name + "_" + poolPair[1].name;
      pairAddress = await factory.getPair(poolPair[0].token.address, poolPair[1].token.address);
      oracleAddress = (await hre.ethers.getContract(`UniswapPairOracle_${pairSymbol}`, deployer)).address;
    } catch (e) {
      const tmp = poolPair[0];
      poolPair[0] = poolPair[1];
      poolPair[1] = tmp;
      pairSymbol = poolPair[0].name + "_" + poolPair[1].name;
      pairAddress = await factory.getPair(poolPair[0].token.address, poolPair[1].token.address);
      oracleAddress = (await hre.ethers.getContract(`UniswapPairOracle_${pairSymbol}`, deployer)).address;
    }

    if (hre.network.name.toLowerCase() == "rsk") {
      pairSymbol = pairSymbol.replace("ETH", "RBTC").replace("WBTC", "ETHs");
    }

    pairInfos.push({
      pair: { address: pairAddress, token0: poolPair[0].token.address, token1: poolPair[1].token.address },
      pairOracle: { pairAddress: pairAddress, oracleAddress: oracleAddress },
      symbol: pairSymbol
    });
  }

  return {
    pairs: pairInfos.map((p) => p.pair),
    pairOracles: pairInfos.map((p) => p.pairOracle),
    pairSymbols: pairInfos.map((p) => p.symbol)
  };
}

async function getStakingsConfig(hre: HardhatRuntimeEnvironment, allowedSwapPairs: { address: string }[]) {
  const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);

  const stakingRewardsAddresses = [];
  for (let i = 0; i < 100; i++) {
    try {
      const address = await stakingRewardsDistribution.stakingRewardsAddresses(i);
      stakingRewardsAddresses.push(address);
    } catch (ex) {
      break;
    }
  }

  const stakings = await Promise.all(
    stakingRewardsAddresses.map(async (address) => {
      const stakingRewards = (await hre.ethers.getContractAt("StakingRewards", address)) as StakingRewards;
      const stakingTokenAddress = await stakingRewards.stakingToken();

      return {
        address: address,
        stakingTokenAddress: stakingTokenAddress
      };
    })
  );

  const approvedStakings = stakings.filter((s) =>
    allowedSwapPairs.some((allowedSwap) => s.stakingTokenAddress.toLowerCase() === allowedSwap.address.toLowerCase())
  );

  return approvedStakings;
}

async function getSwapsConfig(hre: HardhatRuntimeEnvironment) {
  const factory = await getUniswapFactory(hre);
  const pairsCount = (await factory.allPairsLength()).toNumber();

  const pairs = await Promise.all(
    [...Array(pairsCount).keys()].map(async (i) => {
      const pairAddress = await factory.allPairs(i);
      const pair = (await hre.ethers.getContractAt("UniswapV2Pair", pairAddress)) as UniswapV2Pair;
      const token0 = pair.token0();
      const token1 = pair.token1();
      return {
        address: pairAddress,
        token0: await token0,
        token1: await token1
      };
    })
  );

  return pairs;
}

async function getStablesConfig(hre: HardhatRuntimeEnvironment) {
  const allStables = await getAllBDStables(hre);

  const stableConfigs = [];
  for (const stable of allStables) {
    const symbol = await stable.symbol();
    const pools: BdStablePool[] = [await getBDStableWethPool(hre, symbol), await getBDStableWbtcPool(hre, symbol)];

    const stablePools = await Promise.all(
      pools.map(async (pool) => {
        const mintingFee = await pool.minting_fee();
        const redemptionFee = await pool.redemption_fee();
        const collateralAddress = await pool.collateral_token();

        return {
          address: pool.address,
          collateralAddress: collateralAddress.toString(),
          mintingFee: d12_ToNumber(mintingFee),
          redemptionFee: d12_ToNumber(redemptionFee)
        };
      })
    );

    stableConfigs.push({
      address: stable.address,
      fiat: getBDStableFiat(symbol),
      pools: await stablePools
    });
  }

  return stableConfigs;
}
