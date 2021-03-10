import { WETH } from './../typechain/WETH.d';
import { GovernorAlpha } from './../typechain/GovernorAlpha.d';
import { MigrationHelper } from './../typechain/MigrationHelper.d';
import { FRAXStablecoin } from './../typechain/FRAXStablecoin.d';
import { FakeCollateral } from './../typechain/FakeCollateral'
import { Timelock } from './../typechain/Timelock.d';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import BigNumber from 'bignumber.js';
import chalk from 'chalk';
import { FRAXShares } from '../typechain/FRAXShares';

const USE_MAINNET_EXISTING = true;
const IS_MAINNET = (process.env.MIGRATION_MODE == 'mainnet');
const IS_ROPSTEN = (process.env.MIGRATION_MODE == 'ropsten');

// ======== Set other constants ========

const ONE_MILLION_DEC18 = new BigNumber("1000000e18");
const FIVE_MILLION_DEC18 = new BigNumber("5000000e18");
const TEN_MILLION_DEC18 = new BigNumber("10000000e18");
const ONE_HUNDRED_MILLION_DEC18 = new BigNumber("100000000e18");
const ONE_HUNDRED_MILLION_DEC6 = new BigNumber("100000000e6");
const ONE_BILLION_DEC18 = new BigNumber("1000000000e18");
const COLLATERAL_SEED_DEC18 = new BigNumber(508500e18);

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
	debugger;
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

	if (process.env.MIGRATION_MODE == 'ganache') {
		// ======== Give Metamask some ether ========
		console.log(chalk.yellow('===== GIVE METAMASK SOME ETHER ====='));
		//hre.ethers.
		(await hre.ethers.getSigner(COLLATERAL_FRAX_AND_FXS_OWNER.address)).sendTransaction({
			to: METAMASK_ADDRESS,
			value: 1e8
		})
		//send.ether(COLLATERAL_FRAX_AND_FXS_OWNER, METAMASK_ADDRESS, 2e18);
	}

	// ======== Deploy most of the contracts ========
	console.log(chalk.yellow('===== DEPLOY MOST OF THE CONTRACTS ====='));

	const addressContract = await hre.deployments.deploy('Address', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const blockMiner = await hre.deployments.deploy('BlockMiner', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const babylonian = await hre.deployments.deploy('Babylonian', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const uQ112x112 = await hre.deployments.deploy('UQ112x112', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const stringHelpers = await hre.deployments.deploy('StringHelpers', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const fixedPoint = await hre.deployments.deploy('FixedPoint', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});
	const math = await hre.deployments.deploy('Math', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const safeMath = await hre.deployments.deploy('SafeMath', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const transferHelper = await hre.deployments.deploy('TransferHelper', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const uniswapV2ERC20 = await hre.deployments.deploy('UniswapV2ERC20', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const uniswapV2Pair = await hre.deployments.deploy('UniswapV2Pair', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const uniswapV2OracleLibrary = await hre.deployments.deploy('UniswapV2OracleLibrary', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const uniswapV2Library = await hre.deployments.deploy('UniswapV2Library', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const uniswapV2Factory = await hre.deployments.deploy('UniswapV2Factory', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
		args: [DUMP_ADDRESS]
	});;
	const safeERC20 = await hre.deployments.deploy('SafeERC20', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const fraxPoolLibrary = await hre.deployments.deploy('FraxPoolLibrary', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const owned = await hre.deployments.deploy('Owned', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
		args: [COLLATERAL_FRAX_AND_FXS_OWNER.address]
	});;
	const chainlinkETHUSDPriceConsumer = await hre.deployments.deploy('ChainlinkETHUSDPriceConsumer', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const chainlinkETHUSDPriceConsumerTest = await hre.deployments.deploy('ChainlinkETHUSDPriceConsumerTest', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS
	});;
	const timelock = await hre.deployments.deploy('Timelock', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
		args: [TIMELOCK_ADMIN.address, TIMELOCK_DELAY]
	});
	const timelockInstance = await hre.ethers.getContract('Timelock') as unknown as Timelock
	const migrationHelper = await hre.deployments.deploy('MigrationHelper', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
		args: [TIMELOCK_ADMIN.address]
	});
	const migrationHelperInstance = await hre.ethers.getContract('MigrationHelper') as unknown as MigrationHelper

	// FRAX
	const frax = await hre.deployments.deploy('FRAXStablecoin', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
		args: ["Frax", "FRAX", COLLATERAL_FRAX_AND_FXS_OWNER.address, timelock.address]
	});
	const fraxInstance = await hre.ethers.getContract('FRAXStablecoin') as unknown as FRAXStablecoin

	//FXS
	const fxs = await hre.deployments.deploy('FRAXShares', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
		args: ["Frax Share", "FXS", ORACLE_ADDRESS.address, COLLATERAL_FRAX_AND_FXS_OWNER.address, timelock.address]
	});
	const fxsInstance = await hre.ethers.getContract('FRAXShares') as unknown as FRAXShares

	console.log(chalk.yellow("===== Make sure name()'s work ====="));
	let frax_name = await fraxInstance.name();
	let fxs_name = await fxsInstance.name();
	console.log(`frax_name: [${frax_name}]`);
	console.log(`fxs_name: [${fxs_name}]`);

	// ======== Deploy the governance contract and its associated timelock ========
	console.log(chalk.yellow('===== DEPLOY THE GOVERNANCE CONTRACT ====='));
	const governance = await hre.deployments.deploy('GovernorAlpha', {
		from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
		args: [timelock.address, fxsInstance.address, GOVERNOR_GUARDIAN_ADDRESS.address]
	});
	const governanceInstance = await hre.ethers.getContract('GovernorAlpha') as unknown as GovernorAlpha

	await governanceInstance.connect(GOVERNOR_GUARDIAN_ADDRESS).__setTimelockAddress(timelock.address);

	// ======== Set the Governance contract as the timelock admin [Phase 1] ========
	console.log(chalk.yellow('===== SET THE GOVERNANCE CONTRACT AS THE TIMELOCK ADMIN [Phase 1] ====='));
	console.log("GOVERNANCE_ADDRESS [BEFORE]: ", governanceInstance.address);
	let timelock_admin_address = await timelockInstance.admin();
	console.log("timelock_admin [BEFORE]: ", timelock_admin_address)

	// // Give control from TIMELOCK_ADMIN to GovernorAlpha
	let current_timestamp = (await hre.ethers.provider.getBlock('latest')).timestamp;
	let timelock_delay = (await timelockInstance.delay()).toNumber();
	let eta_with_delay = current_timestamp + timelock_delay + 300; // 5 minute buffer
	console.log("timelock_delay [BEFORE]: ", timelock_delay);
	console.log("current_timestamp [BEFORE]: ", current_timestamp);
	console.log("current_timestamp + timelock_delay [BEFORE]: ", eta_with_delay);
	await migrationHelperInstance.connect(TIMELOCK_ADMIN).setGovToTimeLockETA(eta_with_delay);

	const tx_nugget = [
		timelock.address,
		0,
		"setPendingAdmin(address)",
		hre.ethers.utils.defaultAbiCoder.encode(['address'], [governanceInstance.address]),
		eta_with_delay
	] as const
	await timelockInstance.connect(TIMELOCK_ADMIN).queueTransaction(...tx_nugget);

	console.log(chalk.red.bold('NEED TO DO THIS PART LATER [Execute timelock]'));

	// ======== Set FRAX FXS address ========
	console.log(chalk.yellow('===== FRAX FXS ADDRESS ====='));

	// Link the FXS contract to the FRAX contract
	await fraxInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).setFXSAddress(fxsInstance.address);

	// ======== Create or link the collateral ERC20 contracts ========
	let wethInstance;
	let col_instance_USDC;
	let col_instance_USDT;

	if (IS_MAINNET) {
		console.log(chalk.yellow('===== REAL COLLATERAL ====='));
		wethInstance = await hre.ethers.getContractAt('WETH', "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2") as unknown as WETH;
		col_instance_USDC = await hre.ethers.getContractAt('FakeCollateral_USDC', "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48") as unknown as FakeCollateral;
		col_instance_USDT = await hre.ethers.getContractAt('FakeCollateral_USDT', "0xdac17f958d2ee523a2206206994597c13d831ec7") as unknown as FakeCollateral;

	}
	else {
		console.log(chalk.yellow('===== FAKE COLLATERAL ====='));

		wethInstance = await hre.deployments.deploy('WETH', {
			from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
			args: [COLLATERAL_FRAX_AND_FXS_OWNER.address]
		});
		col_instance_USDC = await hre.deployments.deploy('FakeCollateral_USDC', {
			from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
			args: [COLLATERAL_FRAX_AND_FXS_OWNER.address, ONE_HUNDRED_MILLION_DEC6.toString(), "USDC", 6]
		});
		col_instance_USDT = await hre.deployments.deploy('FakeCollateral_USDT', {
			from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
			args: [COLLATERAL_FRAX_AND_FXS_OWNER.address, ONE_HUNDRED_MILLION_DEC6.toString(), "USDT", 6]
		});
	}
	let CONTRACT_ADDRESSES_PHASE_1 = {
		[process.env.MIGRATION_MODE!]: {
			main: {
				FRAX: fraxInstance.address,
				FXS: fxsInstance.address,
				vesting: "NOT_DEPLOYED_YET"
			},
			weth: wethInstance.address,
			oracles: {
				FRAX_WETH: "NOT_DEPLOYED_YET",
				FRAX_USDC: "NOT_DEPLOYED_YET",
				FRAX_USDT: "NOT_DEPLOYED_YET",
				FRAX_FXS: "NOT_DEPLOYED_YET",
				FXS_WETH: "NOT_DEPLOYED_YET",
				FXS_USDC: "NOT_DEPLOYED_YET",
				FXS_USDT: "NOT_DEPLOYED_YET",
				USDC_WETH: "NOT_DEPLOYED_YET",
				USDT_WETH: "NOT_DEPLOYED_YET",
			},
			collateral: {
				USDC: col_instance_USDC.address,
				USDT: col_instance_USDT.address,
			},
			governance: governanceInstance.address,
			pools: {
				USDC: "NOT_DEPLOYED_YET",
				USDT: "NOT_DEPLOYED_YET",
			},
			uniswap_other: {
				router: "NOT_DEPLOYED_YET",
				factory: "NOT_DEPLOYED_YET",
			},
			pricing: {
				swap_to_price: "NOT_DEPLOYED_YET"
			},
			misc: {
				timelock: timelock.address,
				migration_helper: migrationHelper.address
			},
			libraries: {
				UniswapV2OracleLibrary: uniswapV2OracleLibrary.address,
				UniswapV2Library: uniswapV2Library.address,
				FraxPoolLibrary: fraxPoolLibrary.address,
			},
			pair_tokens: {
				'Uniswap FRAX/WETH': "NOT_DEPLOYED_YET",
				'Uniswap FRAX/USDC': "NOT_DEPLOYED_YET",
				'Uniswap FRAX/FXS': "NOT_DEPLOYED_YET",
				'Uniswap FXS/WETH': "NOT_DEPLOYED_YET",
			},
			staking_contracts: {
				'Uniswap FRAX/WETH': "NOT_DEPLOYED_YET",
				'Uniswap FRAX/USDC': "NOT_DEPLOYED_YET",
				'Uniswap FRAX/FXS': "NOT_DEPLOYED_YET",
				'Uniswap FXS/WETH': "NOT_DEPLOYED_YET",
			}
		}
	}

	console.log("CONTRACT_ADDRESSES: ", CONTRACT_ADDRESSES_PHASE_1);

	// One time migration
	return true;
};
func.id = __filename
export default func