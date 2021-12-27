import { task } from "hardhat/config";
import {
  getBdx,
  getDeployer,
  getStakingRewardsDistribution,
  getUniswapFactory,
  getUniswapRouter,
  getVesting,
  getWbtc,
  getWeth,
  getBDStableWethPool,
  getBDStableWbtcPool,
  getBDStableFiat,
  getAllBDStables
} from "../utils/DeployedContractsHelpers";
import { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { d12_ToNumber } from "../utils/NumbersHelpers";
import { BdStablePool } from "../typechain/BdStablePool";
import { StakingRewards } from "../typechain/StakingRewards";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { ContractsNames as PriceFeedContractNames } from "../deploy/7_deploy_price_feeds";
import { cleanStringify } from "../utils/StringHelpers";
import { BDStable } from "../typechain/BDStable";

export function load() {
  task("show:be-config").setAction(async (args, hre) => {
    const deployer = await getDeployer(hre);
    const swaps = await getSwapsConfig(hre);
    const stakingRewards = (await getStakingsConfig(hre, swaps)).map((reward) => {
      return { pairAddress: reward.stakingTokenAddress.toLowerCase(), stakingRewardAddress: reward.address.toLowerCase() };
    });

    const {
      pairs,
      pairOracles,
      pairSymbols
    }: {
      pairs: { address: string; token0: string; token1: string }[];
      pairOracles: { pairAddress: string; oracleAddress: string }[];
      pairSymbols: string[];
    } = await getPairsOraclesAndSymbols(hre, deployer);

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
      // TODO: At the moment this is not generic enough. We should make this part generic as well - https://lagoslabs.atlassian.net/browse/LAGO-125
      [`${networkName}_PRICE_FEEDS`]: {
        ["EUR_USD_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.priceFeedEurUsdName, deployer)).address.toLowerCase(),
        ["BTC_ETH_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.BtcToEthOracle, deployer)).address.toLowerCase(),
        ["ETH_USD_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.priceFeedETHUsdName, deployer)).address.toLowerCase(),
        ["ETH_EUR_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.oracleEthEurName, deployer)).address.toLowerCase()
      },
      [`${networkName}_UPDATER_RSK_ADDRESS`]: (await hre.ethers.getContract("UpdaterRSK", deployer)).address.toLowerCase(),
      [`${networkName}_BDSTABLES_ADDRESSES`]: (await getAllBDStables(hre)).map((stable: BDStable) => stable.address)
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

async function getPairsOraclesAndSymbols(hre: HardhatRuntimeEnvironment, deployer: SignerWithAddress) {
  const factory = await getUniswapFactory(hre);
  const pairsCount = (await factory.allPairsLength()).toNumber();
  const whitelist = await getPairsWhitelist(hre);

  const pairsWhitelistPromise = whitelist.map(async (pair) => {
    return {
      token0Symbol: pair[0].symbol,
      token1Symbol: pair[1].symbol,
      token0Address: pair[0].address.toLowerCase(),
      token1Address: pair[1].address.toLowerCase()
    };
  });

  const pairsWhitelist = await Promise.all(pairsWhitelistPromise);
  const pairInfos = await Promise.all(
    [...Array(pairsCount).keys()].map(async (i) => {
      const pairAddress = await factory.allPairs(i);
      const pair = (await hre.ethers.getContractAt("UniswapV2Pair", pairAddress)) as UniswapV2Pair;
      const token0 = (await pair.token0()).toLowerCase();
      const token1 = (await pair.token1()).toLowerCase();

      let pairSymbols = pairsWhitelist.find(
        (pair) => (pair.token0Address == token0 && pair.token1Address == token1) || (pair.token0Address == token1 && pair.token1Address == token0)
      );
      if (pairSymbols == null) {
        throw new Error("Please update pair whitelist in getPairsWhitelist method to continue.");
      }

      let pairSymbol: string;
      let oracleAddress: string;

      try {
        pairSymbol = pairSymbols?.token0Symbol + "_" + pairSymbols?.token1Symbol;
        oracleAddress = (await hre.ethers.getContract(`UniswapPairOracle_${pairSymbol}`, deployer)).address;
      } catch (e) {
        pairSymbol = pairSymbols?.token1Symbol + "_" + pairSymbols?.token0Symbol;
        oracleAddress = (await hre.ethers.getContract(`UniswapPairOracle_${pairSymbol}`, deployer)).address;
        const temp = pairSymbols.token0Address;
        pairSymbols.token0Address = pairSymbols.token1Address;
        pairSymbols.token1Address = temp;
      }

      if (hre.network.name.toLowerCase() == "rsk") {
        pairSymbol = pairSymbol.replace("ETH", "RBTC").replace("WBTC", "ETHs");
      }

      return {
        pair: { address: pairAddress, token0: pairSymbols.token0Address, token1: pairSymbols.token1Address },
        pairOracle: { pairAddress: pairAddress, oracleAddress: oracleAddress },
        symbol: pairSymbol
      };
    })
  );

  const approvedPairs = pairInfos.filter((pairInfo) => {
    const sortedPair = [pairInfo.pair.token0, pairInfo.pair.token1].sort();
    for (let wlPair of whitelist) {
      const wlPairSorted = [wlPair[0].address.toLowerCase(), wlPair[1].address.toLowerCase()].sort();
      if (wlPairSorted[0] === sortedPair[0] && wlPairSorted[1] === sortedPair[1]) {
        return true;
      }
    }
    return false;
  });

  return {
    pairs: approvedPairs.map((p) => p.pair),
    pairOracles: approvedPairs.map((p) => p.pairOracle),
    pairSymbols: approvedPairs.map((p) => p.symbol)
  };
}

async function getPairsWhitelist(hre: HardhatRuntimeEnvironment) {
  const weth = await getWeth(hre);
  const wbtc = await getWbtc(hre);
  const stables = await getAllBDStables(hre);

  const bdx = await getBdx(hre);

  const whitelist = [
    [
      { symbol: "WETH", address: weth.address },
      { symbol: "BDX", address: bdx.address }
    ],
    [
      { symbol: "WBTC", address: wbtc.address },
      { symbol: "BDX", address: bdx.address }
    ]
  ];

  for (const stable of stables) {
    const symbol = await stable.symbol();

    whitelist.push([
      { symbol: "WETH", address: weth.address },
      { symbol, address: stable.address }
    ]);
    whitelist.push([
      { symbol: "WBTC", address: wbtc.address },
      { symbol, address: stable.address }
    ]);
    whitelist.push([
      { symbol: "BDX", address: bdx.address },
      { symbol, address: stable.address }
    ]);
  }

  return whitelist;
}

async function getStakingsConfig(hre: HardhatRuntimeEnvironment, allowedSwapPairs: Array<{ address: string }>) {
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

  const whitelist = await getPairsWhitelist(hre);

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

  const approvedPairs = pairs.filter((pair) => {
    const sortedPair = [pair.token0.toLowerCase(), pair.token1.toLowerCase()].sort();
    for (let wlPair of whitelist) {
      const wlPairSorted = [wlPair[0].address.toLowerCase(), wlPair[1].address.toLowerCase()].sort();
      if (wlPairSorted[0] === sortedPair[0] && wlPairSorted[1] === sortedPair[1]) {
        return true;
      }
    }
    return false;
  });

  return approvedPairs;
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
