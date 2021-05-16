import { BDXShares } from './../typechain/BDXShares.d';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ChainlinkBasedCryptoFiatFeed } from '../typechain/ChainlinkBasedCryptoFiatFeed';
import * as constants from '../utils/Constants'
import { BDStable } from '../typechain/BDStable';
import { UniswapV2Factory } from '../typechain/UniswapV2Factory';
import { BdStablePool } from '../typechain/BdStablePool';
import { UniswapPairOracle } from '../typechain/UniswapPairOracle';
import TimeTraveler from '../utils/TimeTraveler';

async function deployUniswapOracle(hre: HardhatRuntimeEnvironment, token0Address: string, token1Address: string, token0Name: string, token1Name: string): Promise<UniswapPairOracle> {
  const uniswapFactoryContract = await hre.ethers.getContract("UniswapV2Factory") as unknown as UniswapV2Factory;

  const pairAddress = await uniswapFactoryContract.getPair(token0Address, token1Address);

  await hre.deployments.deploy(`UniswapPairOracle_${token0Name}_${token1Name}`, {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "UniswapPairOracle",
    args: [
      uniswapFactoryContract.address,
      token0Address,
      token1Address,
      (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
      hre.ethers.constants.AddressZero, //todo ag use actual contract
    ]
  });

  const oracle = await hre.ethers.getContract(`UniswapPairOracle_${token0Name}_${token1Name}`) as unknown as UniswapPairOracle;

  console.log(`Deplyed ${token0Name} ${token1Name} Uniswap oracle`);

  return oracle;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkName = ['rinkeby', 'kovan'].includes(hre.network.name) ? hre.network.name as 'rinkeby' | 'kovan' : 'mainnet';
  const [deployer] = await hre.ethers.getSigners();

  const weth_eur_oracle = await hre.deployments.deploy('ChainlinkBasedCryptoFiatFeed_WETH_EUR', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "ChainlinkBasedCryptoFiatFeed",
    args: [constants.EUR_USD_CHAINLINK_FEED[networkName], constants.WETH_USD_CHAINLINK_FEED[networkName]]
  });

  const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract("ChainlinkBasedCryptoFiatFeed_WETH_EUR") as unknown as ChainlinkBasedCryptoFiatFeed;

  console.log("ChainlinkBasedCryptoFiatFeed_WETH_EUR deployed to:", chainlinkBasedCryptoFiatFeed_ETH_EUR.address);

  const bdeur = await hre.ethers.getContract("BDEUR") as unknown as BDStable;
  const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

  await (await bdeur.setETHFIATOracle(chainlinkBasedCryptoFiatFeed_ETH_EUR.address)).wait();
  console.log(`Added WETH EUR oracle to BDEUR`)

  const bdxWethOracle = await deployUniswapOracle(hre, bdx.address, constants.wETH_address[networkName], "BDX", "WETH");
  bdeur.setBDX_WETH_Oracle(bdxWethOracle.address, constants.wETH_address[networkName]);
  console.log(`Added BDX WETH Uniswap oracle`);

  const bdeurWethOracle = await deployUniswapOracle(hre, bdeur.address, constants.wETH_address[networkName], "BDEUR", "WETH");
  bdeur.setBDStable_WETH_Oracle(bdeurWethOracle.address, constants.wETH_address[networkName]);
  console.log(`Added BDEUR WETH Uniswap oracle`);

  const uniswapFactoryContract = await hre.ethers.getContractAt("UniswapV2Factory", constants.uniswapFactoryAddress) as unknown as UniswapV2Factory;

  const btc_eth_oracle = await hre.deployments.deploy('UniswapPairOracle_WBTC_WETH', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
    contract: "UniswapPairOracle",
    args: [
      constants.uniswapFactoryAddress,
      constants.wBTC_address[networkName],
      constants.wETH_address[networkName],
      (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
      hre.ethers.constants.AddressZero, //todo ag use actual contract
    ]
  });

  const bdeurWethPool = await hre.ethers.getContract('BDEUR_WETH_POOL') as BdStablePool;
  const bdeurWbtcPool = await hre.ethers.getContract('BDEUR_WBTC_POOL') as BdStablePool;
  const weth_to_weth_oracle = await hre.deployments.deploy('WethToWethOracle', {
    from: (await hre.getNamedAccounts()).DEPLOYER_ADDRESS,
  });
  await (await bdeurWethPool.setCollatWETHOracle(weth_to_weth_oracle.address, constants.wETH_address[networkName])).wait(); //replace with sth?
  await bdeurWbtcPool.setCollatWETHOracle(btc_eth_oracle.address, constants.wETH_address[networkName]);
  // One time migration
  return true;
};
func.id = __filename
func.tags = ['PriceFeeds'];
func.dependencies = ['StakingRewards'];
export default func;