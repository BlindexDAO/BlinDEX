
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { UniswapV2Factory } from './../typechain/UniswapV2Factory.d';
import { FRAXShares } from '../typechain/FRAXShares';
import { WETH } from '../typechain/WETH';
import { GovernorAlpha } from '../typechain/GovernorAlpha';
import { MigrationHelper } from '../typechain/MigrationHelper';
import { FRAXStablecoin } from '../typechain/FRAXStablecoin';
import { FakeCollateral } from '../typechain/FakeCollateral'
import { Timelock } from '../typechain/Timelock';
import BigNumber from 'bignumber.js';
import chalk from 'chalk';

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

	//if (process.env.MIGRATION_MODE == 'ganache'){
	timelockInstance = await hre.ethers.getContract('Timelock') as unknown as Timelock;
	migrationHelperInstance = await hre.ethers.getContract('MigrationHelper') as unknown as MigrationHelper;
	governanceInstance = await hre.ethers.getContract('GovernorAlpha') as unknown as GovernorAlpha;
	fraxInstance = await hre.ethers.getContract('FRAXStablecoin') as unknown as FRAXStablecoin;
	fxsInstance = await hre.ethers.getContract('FRAXShares') as unknown as FRAXShares;
	wethInstance = await hre.ethers.getContract('WETH') as unknown as WETH;
	col_instance_USDC = await hre.ethers.getContract('FakeCollateral_USDC') as unknown as FakeCollateral;
	col_instance_USDT = await hre.ethers.getContract('FakeCollateral_USDT') as unknown as FakeCollateral;
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


	// ======== Create or link the router and the SwapToPrice ========
	console.log(chalk.yellow('===== DEPLOY OR LINK THE ROUTER AND SWAP_TO_PRICE ====='));
	let routerInstance;
	let uniswapFactoryInstance: UniswapV2Factory;

	if (IS_MAINNET) {
		// Note UniswapV2Router02 vs UniswapV2Router02_Modified
		routerInstance = await hre.ethers.getContractAt('UniswapV2Router02', "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");
		uniswapFactoryInstance = await hre.ethers.getContractAt('UniswapV2Factory', "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f") as unknown as UniswapV2Factory;
	}
	else if (IS_ROPSTEN) {
		// Note UniswapV2Router02 vs UniswapV2Router02_Modified
		routerInstance = await hre.ethers.getContractAt('UniswapV2Router02', "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");
		uniswapFactoryInstance = await hre.ethers.getContractAt('UniswapV2Factory', "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f") as unknown as UniswapV2Factory;
	}
	else {
		const uniswapV2FactoryInstance = await hre.ethers.getContract('UniswapV2Factory')
		await hre.deployments.deploy('UniswapV2Router02', {
			contract: 'UniswapV2Router02_Modified',
			from: DEPLOYER_ADDRESS.address,
			args: [uniswapV2FactoryInstance.address, wethInstance.address]
		})
		routerInstance = await hre.ethers.getContract('UniswapV2Router02');
		uniswapFactoryInstance = uniswapV2FactoryInstance as unknown as UniswapV2Factory;
	}

	let swapToPriceInstance;
	if (IS_MAINNET) {
		swapToPriceInstance = await hre.ethers.getContract('SwapToPrice', '0xa61cBe7E326B13A8dbA11D00f42531BE704DF51B');
	}
	else {
		await hre.deployments.deploy('SwapToPrice', {
			from: DEPLOYER_ADDRESS.address,
			args: [uniswapFactoryInstance.address, routerInstance.address]
		})
		swapToPriceInstance = await hre.ethers.getContract('SwapToPrice');
	}


	// ======== Set the Uniswap pairs ========
	console.log(chalk.yellow('===== SET UNISWAP PAIRS ====='));
	console.log(chalk.blue('=== FRAX / XXXX ==='));
	const [frax_weth_pair] = await uniswapFactoryInstance.getPair(fraxInstance.address, wethInstance.address);
	if(frax_weth_pair !== '0')
		await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).createPair(fraxInstance.address, wethInstance.address),
	await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).createPair(fraxInstance.address, col_instance_USDC.address),
	await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).createPair(fraxInstance.address, col_instance_USDT.address),
	await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).createPair(fraxInstance.address, fxsInstance.address)

	console.log(chalk.blue('=== FXS / XXXX ==='));
	await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).createPair(fxsInstance.address, wethInstance.address),
	await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).createPair(fxsInstance.address, col_instance_USDC.address),
	await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).createPair(fxsInstance.address, col_instance_USDT.address)

	if (!IS_MAINNET) {
		console.log(chalk.blue('=== XXXX / WETH ==='));
		await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).createPair(col_instance_USDC.address, wethInstance.address);
		await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).createPair(col_instance_USDT.address, wethInstance.address);
	}

	// ======== Get the addresses of the pairs ========
	console.log(chalk.yellow('===== GET THE ADDRESSES OF THE PAIRS ====='));
	const pair_addr_FRAX_WETH = await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).getPair(fraxInstance.address, wethInstance.address);
	const pair_addr_FRAX_USDC = await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).getPair(fraxInstance.address, col_instance_USDC.address);
	const pair_addr_FRAX_FXS = await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).getPair(fraxInstance.address, fxsInstance.address);
	const pair_addr_FXS_WETH = await uniswapFactoryInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).getPair(fxsInstance.address, wethInstance.address);

	// ======== Deploy the staking contracts ========
	console.log(chalk.yellow('===== DEPLOY THE STAKING CONTRACTS ====='));
	//await deployer.link(FRAXStablecoin, [StakingRewards_FRAX_WETH, StakingRewards_FRAX_USDC, StakingRewards_FXS_WETH, StakingRewards_FRAX_FXS]);
	//await deployer.link(StringHelpers, [StakingRewards_FRAX_WETH, StakingRewards_FRAX_USDC, StakingRewards_FXS_WETH, StakingRewards_FRAX_FXS]);
	// await Promise.all([

	// 	// hre.deployments.deploy('StakingRewards_FRAX_WETH', {
	// 	// 	from: DEPLOYER_ADDRESS.address,
	// 	// 	args: [STAKING_OWNER, STAKING_REWARDS_DISTRIBUTOR, fxsInstance.address, pair_addr_FRAX_WETH, fraxInstance.address, timelockInstance.address, 500000]
	// 	// }),

	// 	// hre.deployments.deploy('StakingRewards_FRAX_USDC', {
	// 	// 	from: DEPLOYER_ADDRESS.address,
	// 	// 	args: [STAKING_OWNER, STAKING_REWARDS_DISTRIBUTOR, fxsInstance.address, pair_addr_FRAX_USDC, fraxInstance.address, timelockInstance.address, 500000]
	// 	// }),

	// 	hre.deployments.deploy('StakingRewards_FRAX_FXS', {
	// 		from: DEPLOYER_ADDRESS.address,
	// 		args: [STAKING_OWNER, STAKING_REWARDS_DISTRIBUTOR, fxsInstance.address, pair_addr_FRAX_FXS, fraxInstance.address, timelockInstance.address, 0]
	// 	}),

	// 	hre.deployments.deploy('StakingRewards_FXS_WETH', {
	// 		from: DEPLOYER_ADDRESS.address,
	// 		args: [STAKING_OWNER, STAKING_REWARDS_DISTRIBUTOR, fxsInstance.address, pair_addr_FXS_WETH, fraxInstance.address, timelockInstance.address, 0]
	// 	})
	// ])

	// ======== Get various staking addresses ======== 
	console.log(chalk.yellow('===== GET VARIOUS STAKING ADDRESSES ====='));
	//const stakingInstance_FRAX_WETH = await hre.ethers.getContract('StakingRewards_FRAX_WETH');
	//const stakingInstance_FRAX_USDC = await hre.ethers.getContract('StakingRewards_FRAX_USDC');
	//const stakingInstance_FRAX_FXS = await hre.ethers.getContract('StakingRewards_FRAX_FXS');
	//const stakingInstance_FXS_WETH = await hre.ethers.getContract('StakingRewards_FXS_WETH');

	// ======== Get various pair instances ======== 
	console.log(chalk.yellow('===== GET VARIOUS PAIR INSTANCES ====='));
	const pair_instance_FRAX_WETH = await hre.ethers.getContractAt('UniswapV2Pair', pair_addr_FRAX_WETH);
	const pair_instance_FRAX_USDC = await hre.ethers.getContractAt('UniswapV2Pair', pair_addr_FRAX_USDC);
	const pair_instance_FRAX_FXS = await hre.ethers.getContractAt('UniswapV2Pair', pair_addr_FRAX_FXS);
	const pair_instance_FXS_WETH = await hre.ethers.getContractAt('UniswapV2Pair', pair_addr_FXS_WETH);

	// ======== Add allowances to the Uniswap Router ========
	console.log(chalk.yellow('===== ADD ALLOWANCES TO THE UNISWAP ROUTER ====='));
	await wethInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).approve(routerInstance.address, new BigNumber(2000000e18).toFixed()),
	await col_instance_USDC.connect(COLLATERAL_FRAX_AND_FXS_OWNER).approve(routerInstance.address, new BigNumber(2000000e6).toFixed()),
	await col_instance_USDT.connect(COLLATERAL_FRAX_AND_FXS_OWNER).approve(routerInstance.address, new BigNumber(2000000e6).toFixed()),
	await fraxInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).approve(routerInstance.address, new BigNumber(1000000e18).toFixed()),
	await fxsInstance.connect(COLLATERAL_FRAX_AND_FXS_OWNER).approve(routerInstance.address, new BigNumber(5000000e18).toFixed())

	// ======== Note the addresses ========
	// If you are testing the frontend, you need to copy-paste the output of CONTRACT_ADDRESSES to the frontend src/misc/constants.tsx
	let CONTRACT_ADDRESSES_PHASE_2 = {
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
				router: routerInstance.address,
				factory: uniswapFactoryInstance.address,
			},
			pricing: {
				swap_to_price: swapToPriceInstance.address
			},
			misc: {
				timelock: timelockInstance.address,
				migration_helper: migrationHelperInstance.address
			},
			libraries: {
				// UniswapV2OracleLibrary: UniswapV2OracleLibrary.address,
				// UniswapV2Library: UniswapV2Library.address,
				// FraxPoolLibrary: FraxPoolLibrary.address,
			},
			pair_tokens: {
				'Uniswap FRAX/WETH': pair_instance_FRAX_WETH.address,
				'Uniswap FRAX/USDC': pair_instance_FRAX_USDC.address,
				'Uniswap FRAX/FXS': pair_instance_FRAX_FXS.address,
				'Uniswap FXS/WETH': pair_instance_FXS_WETH.address,
			},
			staking_contracts: {
				//'Uniswap FRAX/WETH': stakingInstance_FRAX_WETH.address,
				// 'Uniswap FRAX/USDC': stakingInstance_FRAX_USDC.address,
				// 'Uniswap FRAX/FXS': stakingInstance_FRAX_FXS.address,
				// 'Uniswap FXS/WETH': stakingInstance_FXS_WETH.address,
			}
		}
	}

	console.log("CONTRACT_ADDRESSES: ", CONTRACT_ADDRESSES_PHASE_2);

	// One time migration
	return true;
};
func.id = __filename
export default func;