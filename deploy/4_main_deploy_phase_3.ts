import { UniswapV2Router02 } from './../typechain/UniswapV2Router02.d';
import { UniswapV2Pair } from './../typechain/UniswapV2Pair.d';
import { StakingRewards } from './../typechain/StakingRewards.d';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import { FRAXShares } from '../typechain/FRAXShares';
import { WETH } from '../typechain/WETH';
import { GovernorAlpha } from '../typechain/GovernorAlpha';
import { MigrationHelper } from '../typechain/MigrationHelper';
import { FRAXStablecoin } from '../typechain/FRAXStablecoin';
import { FakeCollateral } from '../typechain/FakeCollateral'
import { Timelock } from '../typechain/Timelock';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import 'hardhat-deploy'
import 'hardhat-deploy-ethers'
import BigNumber from 'bignumber.js';
import chalk from 'chalk';
import { Overrides } from 'ethers';
import { ethers } from 'hardhat';
const { time } = require('@openzeppelin/test-helpers')

const USE_MAINNET_EXISTING = true;
const IS_MAINNET = (process.env.MIGRATION_MODE == 'mainnet');
const IS_ROPSTEN = (process.env.MIGRATION_MODE == 'ropsten');

// ======== Set other constants ========

const FIVE_MILLION_DEC6 = new BigNumber("5000000e6");
const ONE_MILLION_DEC18 = new BigNumber("1000000e18");
const FIVE_MILLION_DEC18 = new BigNumber("5000000e18");
const TEN_MILLION_DEC18 = new BigNumber("10000000e18");
const ONE_HUNDRED_MILLION_DEC18 = new BigNumber("100000000e18");
const ONE_HUNDRED_MILLION_DEC6 = new BigNumber("100000000e6");
const ONE_BILLION_DEC18 = new BigNumber("1000000000e18");
const COLLATERAL_SEED_DEC18 = new BigNumber(508500e18);
const BIG18 = new BigNumber("1e18");

// Starting seed amounts
const FRAX_SEED_AMOUNT_DEC18 = new BigNumber("10000e18");
const FXS_SEED_AMOUNT_DEC18 = new BigNumber("10000e18");

const REDEMPTION_FEE = 400; // 0.04%
const MINTING_FEE = 300; // 0.03%
const COLLATERAL_PRICE = 1040000; // $1.04
const TIMELOCK_DELAY = 2 * 86400; // 2 days
const DUMP_ADDRESS = "0x6666666666666666666666666666666666666666";
const METAMASK_ADDRESS = process.env.METAMASK_ADDRESS;;


const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {

	// ======== Set the addresses ========
	const {
		DEPLOYER_ADDRESS,
		COLLATERAL_FRAX_AND_FXS_OWNER,
		ORACLE_ADDRESS,
		POOL_CREATOR,
		TIMELOCK_ADMIN,
		GOVERNOR_GUARDIAN_ADDRESS,
		STAKING_OWNER,
		STAKING_REWARDS_DISTRIBUTOR
	} = await hre.ethers.getNamedSigners()


	// Print the addresses
	// ================= Start Initializing =================

	// Get the necessary instances
	let CONTRACT_ADDRESSES;
	let timelockInstance: Timelock;
	let migrationHelperInstance: MigrationHelper;
	let fraxInstance: FRAXStablecoin;
	let fxsInstance: FRAXShares;
	let governanceInstance: GovernorAlpha;
	let wethInstance: WETH;
	let col_instance_USDC: FakeCollateral;
	let col_instance_USDT: FakeCollateral;
	let stakingInstance_FRAX_WETH: StakingRewards;
	let stakingInstance_FRAX_USDC: StakingRewards;
	let stakingInstance_FRAX_FXS: StakingRewards;
	let stakingInstance_FXS_WETH: StakingRewards;
	let uniswapFactoryInstance: UniswapV2Factory;
	let pair_instance_FRAX_WETH: UniswapV2Pair;
	let pair_instance_FRAX_USDC: UniswapV2Pair;
	let pair_instance_FRAX_FXS: UniswapV2Pair;
	let pair_instance_FXS_WETH: UniswapV2Pair;
	let routerInstance: UniswapV2Router02;
	//if (process.env.MIGRATION_MODE == 'ganache'){
	timelockInstance = await hre.ethers.getContract('Timelock') as Timelock;
	migrationHelperInstance = await hre.ethers.getContract('MigrationHelper') as MigrationHelper;
	governanceInstance = await hre.ethers.getContract('GovernorAlpha') as GovernorAlpha;
	fraxInstance = await hre.ethers.getContract('FRAXStablecoin') as FRAXStablecoin;
	fxsInstance = await hre.ethers.getContract('FRAXShares') as FRAXShares;
	wethInstance = await hre.ethers.getContract('WETH') as WETH;
	col_instance_USDC = await hre.ethers.getContract('FakeCollateral_USDC') as FakeCollateral;
	col_instance_USDT = await hre.ethers.getContract('FakeCollateral_USDT') as FakeCollateral;

	// stakingInstance_FRAX_FXS = await hre.ethers.getContract('StakingRewards_FRAX_FXS') as StakingRewards;
	// stakingInstance_FXS_WETH = await hre.ethers.getContract('StakingRewards_FXS_WETH') as StakingRewards;
	uniswapFactoryInstance = await hre.ethers.getContract('UniswapV2Factory') as UniswapV2Factory;
	routerInstance = await hre.ethers.getContract('UniswapV2Router02') as UniswapV2Router02;



	const pair_addr_FRAX_WETH = await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).getPair(fraxInstance.address, wethInstance.address);
	const pair_addr_FRAX_USDC = await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).getPair(fraxInstance.address, col_instance_USDC.address);
	const pair_addr_FXS_WETH = await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).getPair(fxsInstance.address, wethInstance.address);
	const pair_addr_FRAX_FXS = await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).getPair(fraxInstance.address, fxsInstance.address);
	pair_instance_FRAX_WETH = await hre.ethers.getContractAt('UniswapV2Pair', pair_addr_FRAX_WETH) as UniswapV2Pair;
	pair_instance_FRAX_USDC = await hre.ethers.getContractAt('UniswapV2Pair', pair_addr_FRAX_USDC) as UniswapV2Pair;
	pair_instance_FRAX_FXS = await hre.ethers.getContractAt('UniswapV2Pair', pair_addr_FRAX_FXS) as UniswapV2Pair;
	pair_instance_FXS_WETH = await hre.ethers.getContractAt('UniswapV2Pair', pair_addr_FXS_WETH) as UniswapV2Pair;
	//	}
	//else {
	// set contracts references as mainnet deployment configuration
	// CONTRACT_ADDRESSES = constants.CONTRACT_ADDRESSES;
	// timelockInstance = await Timelock.at(CONTRACT_ADDRESSES[process.env.MIGRATION_MODE].misc.timelock);
	// migrationHelperInstance = await MigrationHelper.at(CONTRACT_ADDRESSES[process.env.MIGRATION_MODE].misc.migration_helper);
	// governanceInstance = await GovernorAlpha.at(CONTRACT_ADDRESSES[process.env.MIGRATION_MODE].governance);
	// fraxInstance = await FRAXStablecoin.at(CONTRACT_ADDRESSES[process.env.MIGRATION_MODE].main.FRAX);
	// fxsInstance = await FRAXShares.at(CONTRACT_ADDRESSES[process.env.MIGRATION_MODE].main.FXS);
	// wethInstance = await WETH.at(CONTRACT_ADDRESSES[process.env.MIGRATION_MODE].weth);
	// col_instance_USDC = await FakeCollateral_USDC.at(CONTRACT_ADDRESSES[process.env.MIGRATION_MODE].collateral.USDC);
	// col_instance_USDT = await FakeCollateral_USDT.at(CONTRACT_ADDRESSES[process.env.MIGRATION_MODE].collateral.USDT); 

	//}


	// CONTINUE MAIN DEPLOY CODE HERE
	// ====================================================================================================================
	// ====================================================================================================================

	// ======== Spread some FXS around ========
	console.log(chalk.yellow('===== SPREAD SOME FXS AROUND ====='));
	const accounts = await hre.getUnnamedAccounts();

	// Transfer 1,000,000 FXS each to various accounts
	if (!IS_MAINNET) {
		await fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(accounts[1], new BigNumber(ONE_MILLION_DEC18).toFixed());
		await fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(accounts[2], new BigNumber(ONE_MILLION_DEC18).toFixed());
		await fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(accounts[3], new BigNumber(ONE_MILLION_DEC18).toFixed());
		await fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(accounts[4], new BigNumber(ONE_MILLION_DEC18).toFixed());
		await fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(accounts[5], new BigNumber(ONE_MILLION_DEC18).toFixed());
		await fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(accounts[6], new BigNumber(ONE_MILLION_DEC18).toFixed());
		await fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(accounts[7], new BigNumber(ONE_MILLION_DEC18).toFixed());
		await fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(accounts[8], new BigNumber(ONE_MILLION_DEC18).toFixed());
		await fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(accounts[9], new BigNumber(ONE_MILLION_DEC18).toFixed());
	}

	// Transfer FXS to staking contracts
	// console.log(chalk.yellow('===== Transfer FXS to staking contracts ====='));
	// await Promise.all([
	// 	fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(stakingInstance_FRAX_USDC.address, new BigNumber("6000000e18").toFixed()),
	// 	fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(stakingInstance_FRAX_FXS.address, new BigNumber("1000000e18").toFixed()),
	// 	fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).transfer(stakingInstance_FXS_WETH.address, new BigNumber("1000000e18").toFixed())
	// ]);

	if (!IS_MAINNET) {
		// Advance 1 block so you can check the votes below
		await time.increase(20);
		await time.advanceBlock();
	}

	// Print some vote totals
	console.log(chalk.yellow('===== PRINT OUT SOME VOTES ====='));

	const previous_block = (await time.latestBlock()) - 1;

	// Get the prices
	// let stake_FRAX_USDC_votes = (new BigNumber((await fxsInstance.getPriorVotes(stakingInstance_FRAX_USDC.address, previous_block)).toString())).div(BIG18);
	// let stake_FRAX_FXS_votes = (new BigNumber((await fxsInstance.getPriorVotes(stakingInstance_FRAX_FXS.address, previous_block)).toString())).div(BIG18);
	// let stake_FXS_WETH_votes = (new BigNumber((await fxsInstance.getPriorVotes(stakingInstance_FXS_WETH.address, previous_block)).toString())).div(BIG18);

	// Print the new prices
	// console.log("stake_FRAX_USDC_votes: ", stake_FRAX_USDC_votes.toString());
	// console.log("stake_FRAX_FXS_votes: ", stake_FRAX_FXS_votes.toString());
	// console.log("stake_FXS_WETH_votes: ", stake_FXS_WETH_votes.toString());

	// ======== Add liquidity to the pairs so the oracle constructor doesn't error  ========
	// Initially, all prices will be 1:1, but that can be changed in further testing via arbitrage simulations to a known price
	console.log(chalk.yellow('===== ADDING LIQUIDITY TO THE PAIRS ====='));

	// const weth_balance_superowner = (new BigNumber(await wethInstance.balanceOf(COLLATERAL_FRAX_AND_FXS_OWNER))).div(BIG18).toNumber();
	// console.log("weth_balance_superowner: ", weth_balance_superowner);

	// FRAX / WETH
	await routerInstance
		.connect(COLLATERAL_FRAX_AND_FXS_OWNER)
		.addLiquidity(
			fraxInstance.address,
			wethInstance.address,
			new BigNumber(600e18).toFixed(),
			new BigNumber(1e18).toFixed(),
			new BigNumber(600e18).toFixed(),
			new BigNumber(1e18).toFixed(),
			COLLATERAL_FRAX_AND_FXS_OWNER.address,
			new BigNumber(2105300114).toFixed()
		)
	// FRAX / USDC
	await routerInstance
		.connect(COLLATERAL_FRAX_AND_FXS_OWNER)
		.addLiquidity(
			fraxInstance.address,
			col_instance_USDC.address,
			new BigNumber(100e18).toFixed(),
			new BigNumber(100e6).toFixed(),
			new BigNumber(100e18).toFixed(),
			new BigNumber(100e6).toFixed(),
			COLLATERAL_FRAX_AND_FXS_OWNER.address,
			new BigNumber(2105300114).toFixed()
		)
	// FRAX / USDT
	await routerInstance
		.connect(COLLATERAL_FRAX_AND_FXS_OWNER)
		.addLiquidity(
			fraxInstance.address,
			col_instance_USDT.address,
			new BigNumber(100e18).toFixed(),
			new BigNumber(100e6).toFixed(),
			new BigNumber(100e18).toFixed(),
			new BigNumber(100e6).toFixed(),
			COLLATERAL_FRAX_AND_FXS_OWNER.address,
			new BigNumber(2105300114).toFixed()
		)
	// FRAX / FXS
	await routerInstance
		.connect(COLLATERAL_FRAX_AND_FXS_OWNER)
		.addLiquidity(
			fxsInstance.address,
			fraxInstance.address,
			new BigNumber(133333e15).toFixed(),
			new BigNumber(100e18).toFixed(),
			new BigNumber(133333e15).toFixed(),
			new BigNumber(100e18).toFixed(),
			COLLATERAL_FRAX_AND_FXS_OWNER.address,
			new BigNumber(2105300114).toFixed()
		)
	// FXS / WETH
	await routerInstance
		.connect(COLLATERAL_FRAX_AND_FXS_OWNER)
		.addLiquidity(
			fxsInstance.address,
			wethInstance.address,
			new BigNumber(800e18).toFixed(),
			new BigNumber(1e18).toFixed(),
			new BigNumber(800e18).toFixed(),
			new BigNumber(1e18).toFixed(),
			COLLATERAL_FRAX_AND_FXS_OWNER.address,
			new BigNumber(2105300114).toFixed()
		)
	// FXS / USDC
	await routerInstance
		.connect(COLLATERAL_FRAX_AND_FXS_OWNER)
		.addLiquidity(
			fxsInstance.address,
			col_instance_USDC.address,
			new BigNumber(133333e15).toFixed(),
			new BigNumber(100e6).toFixed(),
			new BigNumber(133333e15).toFixed(),
			new BigNumber(100e6).toFixed(),
			COLLATERAL_FRAX_AND_FXS_OWNER.address,
			new BigNumber(2105300114).toFixed()
		)
	// FXS / USDT
	await routerInstance
		.connect(COLLATERAL_FRAX_AND_FXS_OWNER)
		.addLiquidity(
			fxsInstance.address,
			col_instance_USDT.address,
			new BigNumber(133333e15).toFixed(),
			new BigNumber(100e6).toFixed(),
			new BigNumber(133333e15).toFixed(),
			new BigNumber(100e6).toFixed(),
			COLLATERAL_FRAX_AND_FXS_OWNER.address,
			new BigNumber(2105300114).toFixed()
		)


	// These are already liquid on mainnet so no need to seed unless you are in the fake / test environment
	if (!IS_MAINNET) {
		// Handle USDC / WETH
		await routerInstance
			.connect(COLLATERAL_FRAX_AND_FXS_OWNER)
			.addLiquidity(
				col_instance_USDC.address,
				wethInstance.address,
				new BigNumber(600000e6).toFixed(),
				new BigNumber(1000e18).toFixed(),
				new BigNumber(600000e6).toFixed(),
				new BigNumber(1000e18).toFixed(),
				COLLATERAL_FRAX_AND_FXS_OWNER.address,
				new BigNumber(2105300114).toFixed()
			);

		// Handle USDT / WETH
		await routerInstance
			.connect(COLLATERAL_FRAX_AND_FXS_OWNER)
			.addLiquidity(
				col_instance_USDT.address,
				wethInstance.address,
				new BigNumber(600000e6).toFixed(),
				new BigNumber(1000e18).toFixed(),
				new BigNumber(600000e6).toFixed(),
				new BigNumber(1000e18).toFixed(),
				COLLATERAL_FRAX_AND_FXS_OWNER.address,
				new BigNumber(2105300114).toFixed()
			);
	}

	// ======== Set the Uniswap oracles ========
	console.log(chalk.yellow('========== UNISWAP ORACLES =========='));
	console.log(chalk.blue('=== FRAX ORACLES ==='));
	await hre.deployments.deploy('UniswapPairOracle_FRAX_WETH', {
		from: DEPLOYER_ADDRESS.address,
		args: [uniswapFactoryInstance.address, fraxInstance.address, wethInstance.address, COLLATERAL_FRAX_AND_FXS_OWNER.address, timelockInstance.address]
	})
	await hre.deployments.deploy('UniswapPairOracle_FRAX_USDC', {
		from: DEPLOYER_ADDRESS.address,
		args: [uniswapFactoryInstance.address, fraxInstance.address, col_instance_USDC.address, COLLATERAL_FRAX_AND_FXS_OWNER.address, timelockInstance.address]
	})
	await hre.deployments.deploy('UniswapPairOracle_FRAX_USDT', {
		from: DEPLOYER_ADDRESS.address,
		args: [uniswapFactoryInstance.address, fraxInstance.address, col_instance_USDT.address, COLLATERAL_FRAX_AND_FXS_OWNER.address, timelockInstance.address]
	})
	await hre.deployments.deploy('UniswapPairOracle_FRAX_FXS', {
		from: DEPLOYER_ADDRESS.address,
		args: [uniswapFactoryInstance.address, fraxInstance.address, fxsInstance.address, COLLATERAL_FRAX_AND_FXS_OWNER.address, timelockInstance.address]
	})

	console.log(chalk.blue('=== FXS ORACLES ==='));
	await hre.deployments.deploy('UniswapPairOracle_FXS_WETH', {
		from: DEPLOYER_ADDRESS.address,
		args: [uniswapFactoryInstance.address, fxsInstance.address, wethInstance.address, COLLATERAL_FRAX_AND_FXS_OWNER.address, timelockInstance.address]
	})
	await hre.deployments.deploy('UniswapPairOracle_FXS_USDC', {
		from: DEPLOYER_ADDRESS.address,
		args: [uniswapFactoryInstance.address, fxsInstance.address, col_instance_USDC.address, COLLATERAL_FRAX_AND_FXS_OWNER.address, timelockInstance.address]
	})
	await hre.deployments.deploy('UniswapPairOracle_FXS_USDT', {
		from: DEPLOYER_ADDRESS.address,
		args: [uniswapFactoryInstance.address, fxsInstance.address, col_instance_USDT.address, COLLATERAL_FRAX_AND_FXS_OWNER.address, timelockInstance.address]
	})

	console.log(chalk.blue('=== COLLATERAL ORACLES ==='));
	await hre.deployments.deploy('UniswapPairOracle_USDT_WETH', {
		from: DEPLOYER_ADDRESS.address,
		args: [uniswapFactoryInstance.address, col_instance_USDT.address, wethInstance.address, COLLATERAL_FRAX_AND_FXS_OWNER.address, timelockInstance.address]
	})
	await hre.deployments.deploy('UniswapPairOracle_USDC_WETH', {
		from: DEPLOYER_ADDRESS.address,
		args: [uniswapFactoryInstance.address, col_instance_USDC.address, wethInstance.address, COLLATERAL_FRAX_AND_FXS_OWNER.address, timelockInstance.address]
	})

	// ============= Set the Frax Pools ========
	console.log(chalk.yellow('========== FRAX POOLS =========='));
	await hre.deployments.deploy('Pool_USDC', {
		from: DEPLOYER_ADDRESS.address,
		args: [fraxInstance.address, fxsInstance.address, col_instance_USDC.address, POOL_CREATOR.address, timelockInstance.address, FIVE_MILLION_DEC6.toFixed()],
		libraries: {
			FraxPoolLibrary: (await hre.deployments.get('FraxPoolLibrary')).address
		}
	})
	await hre.deployments.deploy('Pool_USDT', {
		from: DEPLOYER_ADDRESS.address,
		args: [fraxInstance.address, fxsInstance.address, col_instance_USDT.address, POOL_CREATOR.address, timelockInstance.address, FIVE_MILLION_DEC6.toFixed()],
		libraries: {
			FraxPoolLibrary: (await hre.deployments.get('FraxPoolLibrary')).address
		}
	})

	// ============= Get the pool instances ========
	console.log(chalk.yellow('========== POOL INSTANCES =========='));
	const pool_instance_USDC = await hre.ethers.getContract('Pool_USDC');
	const pool_instance_USDT = await hre.ethers.getContract('Pool_USDT');

	// ============= Set the redemption and minting fees ========
	console.log(chalk.yellow('========== REDEMPTION AND MINTING FEES =========='));

	// Set the redemption fee to 0.04%
	// Set the minting fee to 0.03%
	await fraxInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).setRedemptionFee(REDEMPTION_FEE)
	await fraxInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).setMintingFee(MINTING_FEE)

	// ============= Set the pool parameters so the minting and redemption fees get set ========
	console.log(chalk.yellow('========== REFRESH POOL PARAMETERS =========='));

	await pool_instance_USDC.connect(POOL_CREATOR).setPoolParameters(FIVE_MILLION_DEC6.toFixed(), 7500, 1, 0, 0, 0, 0)
	await pool_instance_USDT.connect(POOL_CREATOR).setPoolParameters(FIVE_MILLION_DEC6.toFixed(), 7500, 1, 0, 0, 0, 0)

	// ============= Get FRAX and FXS oracles ========
	console.log(chalk.yellow('========== GET FRAX AND FXS ORACLES =========='));

	// Get the instances
	const oracle_instance_FRAX_WETH = await hre.ethers.getContract('UniswapPairOracle_FRAX_WETH');
	const oracle_instance_FRAX_USDC = await hre.ethers.getContract('UniswapPairOracle_FRAX_USDC');
	const oracle_instance_FRAX_USDT = await hre.ethers.getContract('UniswapPairOracle_FRAX_USDT');
	const oracle_instance_FRAX_FXS = await hre.ethers.getContract('UniswapPairOracle_FRAX_FXS');
	const oracle_instance_FXS_WETH = await hre.ethers.getContract('UniswapPairOracle_FXS_WETH');
	const oracle_instance_FXS_USDC = await hre.ethers.getContract('UniswapPairOracle_FXS_USDC');
	const oracle_instance_FXS_USDT = await hre.ethers.getContract('UniswapPairOracle_FXS_USDT');
	const oracle_instance_USDC_WETH = await hre.ethers.getContract('UniswapPairOracle_USDC_WETH');
	const oracle_instance_USDT_WETH = await hre.ethers.getContract('UniswapPairOracle_USDT_WETH');


	// ======== Set the Chainlink oracle ========
	console.log(chalk.yellow('===== SET THE CHAINLINK ORACLE ====='));

	// Initialize ETH-USD Chainlink Oracle too
	let oracle_chainlink_ETH_USD;

	// Add the ETH / USD Chainlink oracle
	if (IS_MAINNET) {
		oracle_chainlink_ETH_USD = await ethers.getContractAt('ChainlinkETHUSDPriceConsumer', "0xBa6C6EaC41a24F9D39032513f66D738B3559f15a");
		await fraxInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).setETHUSDOracle(oracle_chainlink_ETH_USD.address);
	}
	else {
		oracle_chainlink_ETH_USD = await ethers.getContract('ChainlinkETHUSDPriceConsumerTest');
		await fraxInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).setETHUSDOracle(oracle_chainlink_ETH_USD.address);
	}


	// ======== Link oracles ========
	console.log(chalk.yellow('===== LINK ORACLES ====='));

	// Link the oracles
	console.log(chalk.blue('=== FRAX / WETH ORACLE SETTING ==='));
	console.log(chalk.blue('=== COLLATERAL / WETH ORACLE SETTING ==='));
	await fraxInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).setFRAXEthOracle(oracle_instance_FRAX_WETH.address, wethInstance.address),
		await pool_instance_USDC.connect(POOL_CREATOR).setCollatETHOracle(oracle_instance_USDC_WETH.address, wethInstance.address),
		await pool_instance_USDT.connect(POOL_CREATOR).setCollatETHOracle(oracle_instance_USDT_WETH.address, wethInstance.address)


	// ======== Link FXS oracles ========
	console.log(chalk.yellow('===== LINK FXS ORACLES ====='));

	// Link the FXS oracles
	await fraxInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).setFXSEthOracle(oracle_instance_FXS_WETH.address, wethInstance.address);

	// ======== Note the addresses ========
	// If you are testing the frontend, you need to copy-paste the output of CONTRACT_ADDRESSES to the frontend src/misc/constants.tsx
	let CONTRACT_ADDRESSES_PHASE_3 = {
		[process.env.MIGRATION_MODE!]: {
			main: {
				FRAX: fraxInstance.address,
				FXS: fxsInstance.address,
				vesting: "NOT_DEPLOYED_YET"
			},
			weth: wethInstance.address,
			oracles: {
				FRAX_WETH: oracle_instance_FRAX_WETH.address,
				FRAX_USDC: oracle_instance_FRAX_USDC.address,
				FRAX_USDT: oracle_instance_FRAX_USDT.address,
				FRAX_FXS: oracle_instance_FRAX_FXS.address,
				FXS_WETH: oracle_instance_FXS_WETH.address,
				FXS_USDC: oracle_instance_FXS_USDC.address,
				FXS_USDT: oracle_instance_FXS_USDT.address,
				USDC_WETH: oracle_instance_USDC_WETH.address,
				USDT_WETH: oracle_instance_USDT_WETH.address,
			},
			collateral: {
				USDC: col_instance_USDC.address,
				USDT: col_instance_USDT.address,
			},
			governance: governanceInstance.address,
			pools: {
				USDC: pool_instance_USDC.address,
				USDT: pool_instance_USDT.address,
			},
			uniswap_other: {
				router: routerInstance.address,
				factory: uniswapFactoryInstance.address,
			},
			pricing: {
				swap_to_price: (await hre.ethers.getContract('SwapToPrice')).address
			},
			misc: {
				timelock: timelockInstance.address,
				migration_helper: migrationHelperInstance.address
			},
			libraries: {
				UniswapV2OracleLibrary: (await hre.ethers.getContract('UniswapV2OracleLibrary')).address,
				UniswapV2Library: (await hre.ethers.getContract('UniswapV2Library')).address,
				FraxPoolLibrary: (await hre.ethers.getContract('FraxPoolLibrary')).address,
			},
			pair_tokens: {
				'Uniswap FRAX/WETH': pair_instance_FRAX_WETH.address,
				'Uniswap FRAX/USDC': pair_instance_FRAX_USDC.address,
				'Uniswap FRAX/FXS': pair_instance_FRAX_FXS.address,
				'Uniswap FXS/WETH': pair_instance_FXS_WETH.address,
			},
			staking_contracts: {
				// 'Uniswap FRAX/USDC': stakingInstance_FRAX_USDC.address,
				// 'Uniswap FRAX/FXS': stakingInstance_FRAX_FXS.address,
				// 'Uniswap FXS/WETH': stakingInstance_FXS_WETH.address,
			}
		}
	}

	console.log("CONTRACT_ADDRESSES: ", CONTRACT_ADDRESSES_PHASE_3);
	// One time migration
	return true;
};
func.id = __filename
export default func;