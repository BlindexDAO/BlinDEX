import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";

import { bigNumberToDecmal } from "../../utils/Helpers";
import { UniswapPairOracle } from "../../typechain/UniswapPairOracle";

import { provideLiquidity_WETH_BDEUR as provideLiquidity_BDEUR_WETH } from "../helpers/liquidity-providing"
import { deployUniswapOracle } from "../../deploy_manual/manual_deploy_uniswap_price_feeds"
import { BDXShares } from "../../typechain/BDXShares";
import { BDStable } from "../../typechain/BDStable";
import { UniswapV2Factory } from "../../typechain/UniswapV2Factory";
import * as constants from '../../utils/Constatnts'
import { provideLiquidity_WETH_BDEUR } from "../helpers/liquidity-providing"
import { simulateTimeElapseInDays, simulateTimeElapseInSeconds } from "../../utils/Helpers"

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Uniswap Oracles", async () => {
    before(async () => {
        await hre.deployments.fixture();
    });

    const ownerUser = await hre.ethers.getNamedSigner('POOL_CREATOR');

    it.only("should get weth/bdeur price", async () => {
        const bdeur = await hre.ethers.getContract("BDEUR") as unknown as BDStable;

        const testUser1 = await hre.ethers.getNamedSigner('TEST1');
        
        await provideLiquidity_BDEUR_WETH(hre, 20, 80, testUser1);

        const bdeurWethOracleAddress = await deployUniswapOracle(hre, bdeur.address, "BDEUR");
        const bdeurWethOracle = await hre.ethers.getContract("UniswapPairOracle_BDEUR_WETH") as unknown as UniswapPairOracle;
        
        bdeur.setBDStable_WETH_Oracle(bdeurWethOracle.address);
        
        console.log(`Added BDEUR WETH Uniswap oracle`);

        const oracle = await hre.ethers.getContract(
            'UniswapPairOracle_BDEUR_WETH', 
            ownerUser) as unknown as UniswapPairOracle;

        await simulateTimeElapseInDays(1);
        await oracle.update();
        
        const wethBdeurPrice = await oracle.consult(constants.wETH_address, 1);
        const bdeurWethPrice = await oracle.consult(bdeur.address, 1);
        
        const wethBdeurPriceDecimal = bigNumberToDecmal(wethBdeurPrice, 12);
        const bdeurWethPriceDecimal = bigNumberToDecmal(bdeurWethPrice, 12);

        console.log("WETH/BDEUR price: " + wethBdeurPriceDecimal);
        console.log("BDEUR/WETH price: " + bdeurWethPriceDecimal);

        expect(wethBdeurPriceDecimal).to.be.eq(4);
    });

    // it("should get wbtc/bdx price", async () => {

    //     const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;
    //     const bdeur = await hre.ethers.getContract("BDEUR") as unknown as BDStable;

    //     deployUniswapOracle()

    //     const uniswapFactory = await hre.ethers.getContract("UniswapV2Factory", ownerUser) as unknown as UniswapV2Factory;
    //     const pairAddress = await uniswapFactory.getPair(tokenAddress, constants.wETH_address);

    //     const bdxWethOracle = await deployUniswapOracle(hre, bdx.address, "BDXShares");
    //     bdeur.setBDX_WETH_Oracle(bdxWethOracle.address);
    //     console.log(`Added BDX WETH Uniswap oracle`);

    //     const bdeurWethOracle = await deployUniswapOracle(hre, bdx.address, "BDEUR");
    //     bdeur.setBDStable_WETH_Oracle(bdeurWethOracle.address);
    //     console.log(`Added BDEUR WETH Uniswap oracle`);

    //     const testUser1 = await hre.ethers.getNamedSigner('TEST1');
        
    //     await provideLiquidity_BDEUR_WETH(hre, 2, 8, testUser1);

    //     const oracle = await hre.ethers.getContract(
    //         'UniswapPairOracle_BDEUR_WETH', 
    //         ownerUser) as unknown as UniswapPairOracle;

    //     const price = await oracle.consult("WETH", 1);
        
    //     const priceDecimal = bigNumberToDecmal(price, 12);

    //     console.log("WETH price: " + priceDecimal);

    //     expect(priceDecimal).to.be.eq(4);
    // })
})