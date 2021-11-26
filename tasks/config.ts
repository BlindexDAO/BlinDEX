import { task } from "hardhat/config";
import {
    getBdEu, getBdEuWbtcPool, getBdEuWethPool, getBdx, getDeployer, getStakingRewardsDistribution,
    getUniswapFactory, getUniswapRouter, getVesting, getWbtc, getWeth
} from "../utils/DeployedContractsHelpers";
import { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { d12_ToNumber } from "../utils/NumbersHelpers";
import { BdStablePool } from "../typechain/BdStablePool";
import { StakingRewards } from "../typechain/StakingRewards";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";

export function load() {

    task("show:be-config")
        .setAction(async (args, hre) => {
            const deployer = await getDeployer(hre);
            const swaps = await getSwapsConfig(hre);
            const stringifiedSwaps = "[" + swaps.map(swap => `{ "pairAddress": "${swap.address}", "token0Address": "${swap.token0}", "token1Address": "${swap.token1}" }`).join(',') + "]";
            const stakingRewards = await getStakingsConfig(hre, swaps);
            const stringifiedStakingRewards = "[" + stakingRewards.map(reward => `{ "pairAddress": "${reward.stakingTokenAddress}", "stakingRewardAddress": "${reward.address}" }`).join(',') + "]";
            const pairOracles = await getPairOracles(hre, deployer);
            const stringifiedPairOracles = "[" + pairOracles.map(pairOracle => `{ "pairAddress": "${pairOracle.pairAddress}", "oracleAddress": "${pairOracle.oracleAddress}"}`).join(',') + "]";
            const blockchainConfig = `
                BDEU_ADDRESS = ${(await getBdEu(hre)).address}
                UNISWAP_FACTORY_ADDRESS = ${(await getUniswapFactory(hre)).address}
                BDX_ADDRESS = ${(await getBdx(hre)).address}
                STAKING_REWARDS_DISTRIBUTION_ADDRESS = ${(await getStakingRewardsDistribution(hre)).address}
                AVAILABLE_PAIRS = ${stringifiedSwaps}
                STAKING_REWARDS = ${stringifiedStakingRewards}
                PAIR_ORACLES = ${stringifiedPairOracles}
                PRICE_FEED_EUR_USD_ADDRESS = ${(await hre.ethers.getContract('PriceFeed_EUR_USD', deployer)).address}
                PRICE_FEED_BTC_ETH_ADDRESS = ${(await hre.ethers.getContract('BtcToEthOracle', deployer)).address}
            `;

            console.log(blockchainConfig);
        });

    task("show:fe-config")
        .setAction(async (args, hre) => {
            const deployer = await getDeployer(hre);

            const bdEu = await getBdEu(hre);
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
                BD_STABLES: [bdEu.address],
                PRICE_FEED_EUR_USD: (await hre.ethers.getContract('PriceFeed_EUR_USD', deployer)).address,
                BTC_TO_ETH_ORACLE: (await hre.ethers.getContract('BtcToEthOracle', deployer)).address,
            }

            const unquotedBlockchainConfig = JSON.stringify(blockchainConfig).replace(/"([^"]+)":/g, '$1:');

            console.log(unquotedBlockchainConfig);
        });
};

async function getPairOracles(hre: HardhatRuntimeEnvironment, deployer: SignerWithAddress) {
    const factory = await getUniswapFactory(hre);
    const pairsCount = (await factory.allPairsLength()).toNumber();
    const pairsWhitelistPromise = (await getPairsWhitelist(hre)).map(async pair => {
        return { token0Symbol: (await pair[0].symbol()), token1Symbol: (await pair[1].symbol()), token0Address: pair[0].address.toLowerCase(), token1Address: pair[1].address.toLowerCase() }
    });
    const pairsWhitelist = await Promise.all(pairsWhitelistPromise);
    const pairs = await Promise.all([...Array(pairsCount).keys()].map(async i => {
        const pairAddress = await factory.allPairs(i);
        const pair = (await hre.ethers.getContractAt('UniswapV2Pair', pairAddress)) as UniswapV2Pair;
        const token0 = (await pair.token0()).toLowerCase();
        const token1 = (await pair.token1()).toLowerCase();
        let oracleAddress: string = '';

        let pairSymbol = pairsWhitelist.find(pair => (pair.token0Address == token0 && pair.token1Address == token1) || (pair.token0Address == token1 && pair.token1Address == token0));
        if (pairSymbol != null) {
            try {
                oracleAddress = (await hre.ethers.getContract(`UniswapPairOracle_${pairSymbol?.token0Symbol + "_" + pairSymbol?.token1Symbol}`, deployer)).address;
            }
            catch (e) {
                oracleAddress = (await hre.ethers.getContract(`UniswapPairOracle_${pairSymbol?.token1Symbol + "_" + pairSymbol?.token0Symbol}`, deployer)).address;
            }
        }

        return {
            pairAddress: pairAddress,
            oracleAddress: oracleAddress
        };
    }));

    return pairs;
}

async function getPairsWhitelist(hre: HardhatRuntimeEnvironment) {
    const weth = await getWeth(hre);
    const wbtc = await getWbtc(hre);
    const bdEu = await getBdEu(hre);
    const bdx = await getBdx(hre);

    const whitelist = [
        [weth, bdEu],
        [wbtc, bdEu],
        [weth, bdx],
        [wbtc, bdx],
        [bdx, bdEu]
    ]

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

    const stakings = await Promise.all(stakingRewardsAddresses.map(async address => {
        const stakingRewards = (await hre.ethers.getContractAt('StakingRewards', address)) as StakingRewards;
        const stakingTokenAddress = await stakingRewards.stakingToken();

        return {
            address: address,
            stakingTokenAddress: stakingTokenAddress,
        }
    }));

    const approvedStakings = stakings
        .filter(s => allowedSwapPairs
            .some(allowedSwap => s.stakingTokenAddress.toLowerCase() === allowedSwap.address.toLowerCase()))

    return approvedStakings;
}

async function getSwapsConfig(hre: HardhatRuntimeEnvironment) {
    const factory = await getUniswapFactory(hre);
    const pairsCount = (await factory.allPairsLength()).toNumber();

    const whitelist = await getPairsWhitelist(hre);

    const pairs = await Promise.all([...Array(pairsCount).keys()].map(async i => {
        const pairAddress = await factory.allPairs(i);
        const pair = (await hre.ethers.getContractAt('UniswapV2Pair', pairAddress)) as UniswapV2Pair;
        const token0 = pair.token0();
        const token1 = pair.token1();
        return {
            address: pairAddress,
            token0: await token0,
            token1: await token1
        };
    }));

    const approvedPairs = pairs.filter(pair => {
        const sortedPair = [pair.token0.toLowerCase(), pair.token1.toLowerCase()].sort();
        for (let wlPair of whitelist) {
            const wlPairSorted = [wlPair[0].address.toLowerCase(), wlPair[1].address.toLowerCase()].sort();
            if (wlPairSorted[0] === sortedPair[0] && wlPairSorted[1] === sortedPair[1]) {
                return true;
            }
        }
        return false;
    })

    return approvedPairs;
}

async function getStablesConfig(hre: HardhatRuntimeEnvironment) {
    const bdEu = await getBdEu(hre);

    const bdEuPoolContracts: BdStablePool[] = [await getBdEuWethPool(hre), await getBdEuWbtcPool(hre)];

    const bdEuPools = await Promise.all(bdEuPoolContracts.map(async pool => {

        const mingingFee = await pool.minting_fee();
        const redemptionFee = await pool.redemption_fee();
        const collateralAddress = await pool.collateral_token();

        return {
            address: pool.address,
            collateralAddress: collateralAddress.toString(),
            mintingFee: d12_ToNumber(mingingFee),
            redemptionFee: d12_ToNumber(redemptionFee),
        }
    }));

    const stables = [
        {
            address: bdEu.address,
            fiat: "EUR",
            pools: await bdEuPools
        }
    ];

    return stables;
}
