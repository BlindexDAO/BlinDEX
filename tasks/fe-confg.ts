import { task } from "hardhat/config";
import { 
    getBdEu, getBdEuWbtcPool, getBdEuWethPool, getBdx, getDeployer, getStakingRewardsDistribution,
    getTreasury, getUniswapFactory, getUniswapPair, getUniswapRouter, getVesting, getWbtc, getWeth 
} from "../utils/DeployedContractsHelpers";
import { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { d12_ToNumber, d18_ToNumber, to_d12, to_d18 } from "../utils/NumbersHelpers";
import { BdStablePool } from "../typechain/BdStablePool";
import { StakingRewards } from "../typechain/StakingRewards";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export function load() {

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

async function getPairsWhitelist(hre: HardhatRuntimeEnvironment){
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

async function getStakingsConfig(hre: HardhatRuntimeEnvironment, allowedSwapPairs: Array<{address: string}>) {
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
        for(let wlPair of whitelist){
            const wlPairSorted = [wlPair[0].address.toLowerCase(), wlPair[1].address.toLowerCase()].sort();
            if(wlPairSorted[0] === sortedPair[0] && wlPairSorted[1] === sortedPair[1]){
                return true;
            }
        }
        return  false;
    })

    return approvedPairs;
}

async function getStablesConfig(hre: HardhatRuntimeEnvironment) {
    const bdEu = await getBdEu(hre);

    const bdEuPoolContracts: BdStablePool[] = [await getBdEuWethPool(hre), await getBdEuWbtcPool(hre)];

    const bdEuPools = await Promise.all(bdEuPoolContracts.map(async pool => {

        const mingingFee = await pool.minting_fee();
        const redemptionFee = await pool.redemption_fee();
        const collateralAddress = await pool.collateral_address();

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
