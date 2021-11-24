import { task } from "hardhat/config";
import { getBdEu, getDeployer, getTreasury, getUniswapPair, getUniswapPairOracle } from "../utils/DeployedContractsHelpers";
import { UniswapV2Pair } from "../typechain/UniswapV2Pair";
import { d12_ToNumber, d18_ToNumber, to_d12, to_d18 } from "../utils/NumbersHelpers";
import { getPools, updateOracles } from "../utils/UniswapPoolsHelpers";
import { BDStable } from "../typechain/BDStable";
import { FiatToFiatPseudoOracleFeed } from "../typechain/FiatToFiatPseudoOracleFeed";
import { IPriceFeed } from "../typechain/IPriceFeed";
import { ICryptoPairOracle } from "../typechain/ICryptoPairOracle";
import * as constants from '../utils/Constants'
import { SovrynSwapPriceFeed__factory } from '../typechain/factories/SovrynSwapPriceFeed__factory';
import { Signer, BigNumber } from 'ethers';
import { SignerWithAddress } from 'hardhat-deploy-ethers/dist/src/signers';
import { ISovrynLiquidityPoolV1Converter__factory } from '../typechain/factories/ISovrynLiquidityPoolV1Converter__factory';
import { RSK_SOVRYN_xUSDT_wrBTC_SWAP_ADDRESS } from "../utils/Constants";

export function load() {

  task("update:oracles")
    .setAction(async (args, hre) => {
      await updateOracles(hre);
    });

  task("setPoolConsultLeniency")
    .addPositionalParam("newVal", "new value")
    .setAction(async ({ newVal }, hre) => {
      const pools = await getPools(hre);

      console.log("setting consultLeniency to: " + newVal);

      for (let pool of pools) {
        const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        console.log(`starting for ${pool[0].name} / ${pool[1].name}`);
        
        await (await oracle.setConsultLeniency(newVal)).wait();
        console.log("pool done");
      }
      console.log("all done");
    });
  
  task("set:AllowStaleConsults")
    .addPositionalParam("enable", "1 = enable, 0 = disable")
    .setAction(async ({ enable }, hre) => {
      const pools = await getPools(hre);
      for (let pool of pools) {
        const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        
        await(await oracle.setAllowStaleConsults(enable == 0 ? false : true)).wait();
        console.log(`oracle ${pool[0].name} / ${pool[1].name} allow stale consults = ${enable}`);
      }
    });

  task("set:lock-cr-at")
    .addPositionalParam("stableAddress", "stable address")
    .addPositionalParam("val", "value")
    .setAction(async ({ stableAddress, val }, hre) => {

      if(val < 0 || val > 1) {
        throw "invalid cr value"
      }

      const deployer = getDeployer(hre);

      const stable = await hre.ethers.getContractAt("BDStable", stableAddress) as BDStable;
      await (await stable.connect((await deployer).address).lockCollateralRatioAt(to_d12(val))).wait();
    });

  task("set:toggle-pause-cr")
    .addPositionalParam("stableAddress", "stable address")
    .setAction(async ({ stableAddress }, hre) => {

      const deployer = getDeployer(hre);

      const stable = await hre.ethers.getContractAt("BDStable", stableAddress) as BDStable;
      await(await stable.connect((await deployer).address).toggleCollateralRatioPaused()).wait();
    });

  task("set:rsk-eur-usd")
    .addPositionalParam("newPrice", "new price")
    .setAction(async ({newPrice}, hre) => {
      const bot = await hre.ethers.getNamedSigner('BOT');

      if(newPrice < 0.5 || newPrice > 2){
        throw "invalid price";
      }

      console.log("Setting EUR/USD: " + newPrice);

      const feed = await hre.ethers.getContract("PriceFeed_EUR_USD") as FiatToFiatPseudoOracleFeed;
      await(await feed.connect(bot).setPrice(to_d12(newPrice))).wait();
    });

  // -------------------------- readonly

  task("show:oracles-validFor")
    .setAction(async (args, hre) => {
      const pools = await getPools(hre);
      for (let pool of pools) {
        const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
        const validFor = await oracle.when_should_update_oracle_in_seconds();
        console.log(`oracle ${pool[0].name} / ${pool[1].name} valid for: ${validFor}s`);
      }
    });

  task("show:pools")
    .setAction(async (args, hre) => {
      const pools = await getPools(hre);

      for (let pool of pools) {
        const pair = await getUniswapPair(hre, pool[0].token, pool[1].token);
        console.log(`${pool[0].name} / ${pool[1].name} : ${pair.address}`);
        console.log(`\t${pool[0].token.address} / ${pool[1].token.address}`);
      }
    });

  task("show:pool-reserves")
    .addPositionalParam("pairAddress", "pair address")
    .setAction(async ({ pairAddress }, hre) => {
      const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;
      const reserves = await pair.getReserves();
      console.log(`Reserves: ${d18_ToNumber(reserves[0])} ${d18_ToNumber(reserves[1])}`)
    });

  task("show:users")
    .setAction(async (args, hre) => {
      const deployer = await getDeployer(hre);
      const treasury = await getTreasury(hre);

      console.log("deployer: " + deployer.address);
      console.log("treasury: " + treasury.address);
    });

  task("show:rsk-eur-usd")
    .setAction(async (args, hre) => {
      const feed = await hre.ethers.getContract("PriceFeed_EUR_USD") as FiatToFiatPseudoOracleFeed;
      const price = d12_ToNumber(await feed.price());      
      console.log("EUR/USD: " + price);
    });
  
  task("show:rsk-eth-usd")
    .setAction(async (args, hre) => {
      const feed = await hre.ethers.getContract("PriceFeed_ETH_USD") as IPriceFeed;
      const price = d12_ToNumber(await feed.price());      
      console.log("ETH/USD (RSK: BTC/USD): " + price);
    });

  task("show:rsk-btc-usd")
    .setAction(async (args, hre) => {
      const updater = '0x9c385013670f34256450aba0ba7bd1b36ef02326';
      const feed =  SovrynSwapPriceFeed__factory.connect('0xAc78F96c68dBe1f1c93fdB0EFAc61355670e0285', await hre.ethers.getSigner(updater))
      const btcFor1usd = d18_ToNumber(await feed.consult(constants.wETH_address[hre.network.name], to_d18(1)));
      console.log("BTC/usd: " + btcFor1usd);
    });

    task("update:rsk-btc-usd")
    .setAction(async (args, hre) => {
      const updater = '0x9c385013670f34256450aba0ba7bd1b36ef02326';
      const feed =  SovrynSwapPriceFeed__factory.connect('0xAc78F96c68dBe1f1c93fdB0EFAc61355670e0285', await hre.ethers.getSigner(updater))
      const tx = await feed.updateOracleWithVerification(BigNumber.from('56845406814023944'));
      const result = await tx.wait(1);
      console.log(result.blockHash);
    });

    task("show:rsk-btc-usd-sovryn")
    .setAction(async (args, hre) => {
      const updater = '0x9c385013670f34256450aba0ba7bd1b36ef02326';
      const feed =  ISovrynLiquidityPoolV1Converter__factory.connect(RSK_SOVRYN_xUSDT_wrBTC_SWAP_ADDRESS, await hre.ethers.getSigner(updater))
      const tokenSource = '0x542fda317318ebf1d3deaf76e0b632741a7e677d';
      const targetToken = constants.XUSD_ADDRESS;
      const [amountMinusFee, fee] = (await feed.targetAmountAndFee(tokenSource, targetToken, 1e12));
      console.log(`BTC/USD: ${amountMinusFee}, fee: ${fee}, amount with fee: ${amountMinusFee.add(fee)}`);
    });

    task("show:rsk-btc-usd-seconds")
    .setAction(async (args, hre) => {
      const updater = '0x9c385013670f34256450aba0ba7bd1b36ef02326';
      const feed =  SovrynSwapPriceFeed__factory.connect('0xAc78F96c68dBe1f1c93fdB0EFAc61355670e0285', await hre.ethers.getSigner(updater))
      const secondsToUpdate = await feed.when_should_update_oracle_in_seconds();
      console.log("remaining seconds: " + secondsToUpdate);
    });

    task("show:rsk-btc-usd-should-update")
    .setAction(async (args, hre) => {
      const updater = '0x9c385013670f34256450aba0ba7bd1b36ef02326';
      const feed =  SovrynSwapPriceFeed__factory.connect('0xAc78F96c68dBe1f1c93fdB0EFAc61355670e0285', await hre.ethers.getSigner(updater))
      const shouldUpdate = await feed.shouldUpdateOracle();
      console.log("should update: " + shouldUpdate);
    });

  task("show:bdeu-ef-bdx-cov")
    .setAction(async (args, hre) => {
      const bdeu = await getBdEu(hre);
      const efBdxCov = await bdeu.get_effective_bdx_coverage_ratio();
      console.log("BEDU efBDXCov: " + d12_ToNumber(efBdxCov));
    });
}