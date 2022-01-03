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
import type { ERC20 } from "../typechain/ERC20";
import { d12_ToNumber } from "../utils/NumbersHelpers";
import type { BdStablePool } from "../typechain/BdStablePool";
import type { StakingRewards } from "../typechain/StakingRewards";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { ContractsNames as PriceFeedContractNames } from "../deploy/7_deploy_price_feeds";
import { cleanStringify } from "../utils/StringHelpers";
import type { BDStable } from "../typechain/BDStable";
import { getPoolKey, getPools } from "../utils/UniswapPoolsHelpers";

export function load() {
  task("show:be-config").setAction(async (args, hre) => {
    const deployer = await getDeployer(hre);
    const stakingRewards = (await getStakingsConfig(hre)).map(reward => {
      return {
        pairAddress: reward.stakingTokenAddress,
        stakingRewardAddress: reward.address,
        token0Address: reward.token0Address,
        token1Address: reward.token1Address,
        token0Symbol: reward.token0Symbol,
        token1Symbol: reward.token1Symbol
      };
    });

    const pairOracles = await getPairsOraclesAndSymbols(hre, deployer);

    const swapPairs = pairOracles.map(pairOracle => {
      return {
        pairAddress: pairOracle.pair.address,
        token0Address: pairOracle.pair.token0,
        token1Address: pairOracle.pair.token1,
        token0Symbol: pairOracle.pair.token0Symbol,
        token1Symbol: pairOracle.pair.token1Symbol
      };
    });

    const mappedPairOracles = pairOracles.map(pairOracle => {
      return {
        pairAddress: pairOracle.pair.address,
        oracleAddress: pairOracle.pairOracle.oracleAddress,
        token0Address: pairOracle.pair.token0,
        token1Address: pairOracle.pair.token1,
        token0Symbol: pairOracle.pair.token0Symbol,
        token1Symbol: pairOracle.pair.token1Symbol
      };
    });

    const pairSymbols = pairOracles.map(po => po.symbol);

    const networkName = hre.network.name.toUpperCase();

    const blockchainConfig = {
      [`${networkName}`]: {
        [`UNISWAP_FACTORY_ADDRESS`]: (await getUniswapFactory(hre)).address,
        [`BDX_ADDRESS`]: (await getBdx(hre)).address,
        [`STAKING_REWARDS_DISTRIBUTION_ADDRESS`]: (await getStakingRewardsDistribution(hre)).address,
        [`AVAILABLE_PAIR_SYMBOLS`]: pairSymbols,
        [`AVAILABLE_PAIRS`]: swapPairs,
        [`STAKING_REWARDS`]: stakingRewards,
        [`PAIR_ORACLES`]: mappedPairOracles,
        [`PRICE_FEEDS`]: {
          ["EUR_USD_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.priceFeedEurUsdName, deployer)).address,
          ["BTC_ETH_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.BtcToEthOracle, deployer)).address,
          ["ETH_USD_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.priceFeedETHUsdName, deployer)).address,
          ["ETH_EUR_ADDRESS"]: (await hre.ethers.getContract(PriceFeedContractNames.oracleEthEurName, deployer)).address
        },
        [`UPDATER_RSK_ADDRESS`]: (await hre.ethers.getContract("UpdaterRSK", deployer)).address,
        [`BDSTABLES`]: await getStablesConfig(hre)
      }
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
    const swaps = await getSwapsConfig(hre, deployer);
    const stakings = await getStakingsConfig(hre);

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
  const pools = await getPools(hre);

  const pairInfos: {
    pair: { address: string; token0: string; token1: string; token0Symbol: string; token1Symbol: string };
    pairOracle: { pairAddress: string; oracleAddress: string };
    symbol: string;
  }[] = [];
  for (const poolPair of pools) {
    let pairSymbol = getPoolKey(poolPair[0].token.address, poolPair[1].token.address, poolPair[0].name, poolPair[1].name);
    const pairAddress = await factory.getPair(poolPair[0].token.address, poolPair[1].token.address);
    const oracleAddress = (await hre.ethers.getContract(`UniswapPairOracle_${pairSymbol}`, deployer)).address;

    if (hre.network.name.toLowerCase() == "rsk") {
      pairSymbol = pairSymbol.replace("ETH", "RBTC").replace("WBTC", "ETHs");
    }

    pairInfos.push({
      pair: {
        address: pairAddress,
        token0: poolPair[0].token.address,
        token1: poolPair[1].token.address,
        token0Symbol: poolPair[0].name,
        token1Symbol: poolPair[1].name
      },
      pairOracle: { pairAddress: pairAddress, oracleAddress: oracleAddress },
      symbol: pairSymbol
    });
  }

  return pairInfos;
}

async function getStakingsConfig(hre: HardhatRuntimeEnvironment) {
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
    stakingRewardsAddresses.map(async address => {
      const stakingRewards = (await hre.ethers.getContractAt("StakingRewards", address)) as StakingRewards;
      const stakingTokenAddress = await stakingRewards.stakingToken();

      const lpAddress = await stakingRewards.stakingToken();
      const lp = (await hre.ethers.getContractAt("UniswapV2Pair", lpAddress)) as UniswapV2Pair;
      const token0Address = await lp.token0();
      const token1Address = await lp.token1();
      const token0 = (await hre.ethers.getContractAt("ERC20", token0Address)) as ERC20;
      const token1 = (await hre.ethers.getContractAt("ERC20", token1Address)) as ERC20;

      return {
        address: address,
        stakingTokenAddress: stakingTokenAddress,
        token0Address: token0.address,
        token1Address: token1.address,
        token0Symbol: (await token0.symbol()).toUpperCase(),
        token1Symbol: (await token1.symbol()).toUpperCase()
      };
    })
  );

  return stakings;
}

async function getSwapsConfig(hre: HardhatRuntimeEnvironment, deployer: SignerWithAddress) {
  const swaps = (await getPairsOraclesAndSymbols(hre, deployer)).map(pairInfo => pairInfo.pair);
  return swaps;
}

async function getStablesConfig(hre: HardhatRuntimeEnvironment) {
  const allStables = await getAllBDStables(hre);

  const stableConfigs = [];
  for (const stable of allStables) {
    const symbol = await stable.symbol();
    const pools: BdStablePool[] = [await getBDStableWethPool(hre, symbol), await getBDStableWbtcPool(hre, symbol)];

    const stablePools = await Promise.all(
      pools.map(async pool => {
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
      symbol: await stable.symbol(),
      decimals: await stable.decimals(),
      address: stable.address,
      fiat: getBDStableFiat(symbol),
      pools: await stablePools
    });
  }

  return stableConfigs;
}
