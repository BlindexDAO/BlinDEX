import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";

import { bigNumberToDecmal } from "../../utils/Helpers";
import { UniswapPairOracle } from "../../typechain/UniswapPairOracle";

import { deployUniswapOracle } from "../../deploy_manual/manual_deploy_uniswap_price_feeds"
import { BDXShares } from "../../typechain/BDXShares";
import { BDStable } from "../../typechain/BDStable";
import * as constants from '../../utils/Constatnts'
import { provideLiquidity_WETH_BDEUR, provideLiquidity_BDX_WETH} from "../helpers/liquidity-providing"
import { simulateTimeElapseInDays, simulateTimeElapseInSeconds, toErc20 } from "../../utils/Helpers"

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Uniswap Oracles", async () => {
    before(async () => {
        await hre.deployments.fixture();
    });

    const ownerUser = await hre.ethers.getNamedSigner('POOL_CREATOR');

    it("should get weth/bdeur price", async () => {
        const bdeur = await hre.ethers.getContract("BDEUR") as unknown as BDStable;

        const testUser1 = await hre.ethers.getNamedSigner('TEST1');
        
        await provideLiquidity_WETH_BDEUR(hre, 20, 80, testUser1);

        await deployUniswapOracle(hre, bdeur.address, "BDEUR");
        const bdeurWethOracle = await hre.ethers.getContract("UniswapPairOracle_BDEUR_WETH") as unknown as UniswapPairOracle;
        
        bdeur.setBDStable_WETH_Oracle(bdeurWethOracle.address);
        
        console.log(`Added BDEUR WETH Uniswap oracle`);

        const oracle = await hre.ethers.getContract(
            'UniswapPairOracle_BDEUR_WETH', 
            ownerUser) as unknown as UniswapPairOracle;

        await simulateTimeElapseInDays(1);
        await oracle.update();
        
        const wethBdeurPrice = await oracle.consult(constants.wETH_address, toErc20(1));
        const bdeurWethPrice = await oracle.consult(bdeur.address, toErc20(1));
        
        const wethBdeurPriceDecimal = bigNumberToDecmal(wethBdeurPrice, 18);
        const bdeurWethPriceDecimal = bigNumberToDecmal(bdeurWethPrice, 18);

        console.log("WETH/BDEUR price: " + wethBdeurPriceDecimal);
        console.log("BDEUR/WETH price: " + bdeurWethPriceDecimal);

        expect(wethBdeurPriceDecimal).to.be.eq(4);
        expect(bdeurWethPriceDecimal).to.be.eq(0.25);
    });

    it("should get weth/bdx price", async () => {
        const bdeur = await hre.ethers.getContract("BDEUR") as unknown as BDStable;
        const bdx = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

        const testUser1 = await hre.ethers.getNamedSigner('TEST1');
        
        await provideLiquidity_BDX_WETH(hre, 20, 80, testUser1);

        await deployUniswapOracle(hre, bdx.address, "BDX");
        const bdxWethOracle = await hre.ethers.getContract("UniswapPairOracle_BDX_WETH") as unknown as UniswapPairOracle;
        
        bdeur.setBDStable_WETH_Oracle(bdxWethOracle.address);
        
        console.log(`Added BDX WETH Uniswap oracle`);

        const oracle = await hre.ethers.getContract(
            'UniswapPairOracle_BDX_WETH', 
            ownerUser) as unknown as UniswapPairOracle;

        await simulateTimeElapseInDays(1);
        await oracle.update();
        
        const wethBdxPrice = await oracle.consult(constants.wETH_address, toErc20(1));
        const bdxWethPrice = await oracle.consult(bdx.address, toErc20(1));
        
        const wethBdxPriceDecimal = bigNumberToDecmal(wethBdxPrice, 18);
        const bdxWethPriceDecimal = bigNumberToDecmal(bdxWethPrice, 18);

        console.log("WETH/BDX price: " + wethBdxPriceDecimal);
        console.log("BDX/WETH price: " + bdxWethPriceDecimal);

        expect(wethBdxPriceDecimal).to.be.eq(4);
        expect(bdxWethPriceDecimal).to.be.eq(0.25);
    })
})