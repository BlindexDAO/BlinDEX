import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { BDStable } from "../../typechain/BDStable";
import * as constants from '../../utils/Constants'
import { 
    provideLiquidity_WETH_BDEUR,
    provideLiquidity_WETH_BDX,
    updateWethPair,
    swapWethFor,
    getPrices
} from "../helpers/swaps"
import { getWethPair } from "../../utils/Swaps"
import { simulateTimeElapseInSeconds, to_d18 } from "../../utils/Helpers"

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Uniswap Oracles", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    const oneHour = 60*60;

    it("should add bdeur oracle", async () => {
        const bdeur = await hre.ethers.getContract("BDEUR") as unknown as BDStable;

        const testUser1 = await hre.ethers.getNamedSigner('TEST1');
        
        await provideLiquidity_WETH_BDEUR(hre, 20, 80, testUser1);
        await simulateTimeElapseInSeconds(oneHour);

        const bdeurWethOracle = await getWethPair(hre, "BDEUR");
        
        bdeur.setBDStable_WETH_Oracle(bdeurWethOracle.address, constants.wETH_address[hre.network.name]);

        await swapWethFor(hre, "BDEUR", 5);
        await updateWethPair(hre, "BDEUR");
        const [wethInBdStablePriceDecimal1, bdStableInWethPriceDecimal1] = await getPrices(hre, "BDEUR");
    });

    it("should add bdx oracle", async () => {
        const bdeur = await hre.ethers.getContract("BDEUR") as unknown as BDStable;

        const testUser1 = await hre.ethers.getNamedSigner('TEST1');
        
        await provideLiquidity_WETH_BDX(hre, 20, 80, testUser1);

        const bdxWethOracle = await getWethPair(hre, "BDXShares");
        
        bdeur.setBDX_WETH_Oracle(bdxWethOracle.address, constants.wETH_address[hre.network.name]);

        await swapWethFor(hre, "BDXShares", 5);
        await updateWethPair(hre, "BDXShares");
        const [wethInBdxPriceDecimal1, bdxInWethPriceDecimal1] = await getPrices(hre, "BDXShares");
    })

    it("should update price after swap", async () => {
        const testUserLiquidityProvider = await hre.ethers.getNamedSigner('TEST1');

        await provideLiquidity_WETH_BDEUR(hre, 20, 80, testUserLiquidityProvider);
        
        await simulateTimeElapseInSeconds(oneHour);

        await swapWethFor(hre, "BDEUR", 5);
        const [wethInBdStablePriceDecimal1, bdStableInWethPriceDecimal1] = await getPrices(hre, "BDEUR");

        // swap triggers price update based on PREVIOUS reserves and time elapased since PREVIOUS update
        expect(wethInBdStablePriceDecimal1).to.be.eq(4);
        expect(bdStableInWethPriceDecimal1).to.be.eq(0.25);

        await simulateTimeElapseInSeconds(oneHour);

        await swapWethFor(hre, "BDEUR", 1);
        const [wethInBdStablePriceDecimal2, bdStableInWethPriceDecimal2]  = await getPrices(hre, "BDEUR");

        expect(wethInBdStablePriceDecimal2).to.be.lt(wethInBdStablePriceDecimal1);
        expect(bdStableInWethPriceDecimal2).to.be.gt(bdStableInWethPriceDecimal1);
    });

    it("should not update price before one hour elapses", async () => {
        const testUserLiquidityProvider = await hre.ethers.getNamedSigner('TEST1');

        await provideLiquidity_WETH_BDEUR(hre, 20, 80, testUserLiquidityProvider);
        await simulateTimeElapseInSeconds(oneHour);

        await swapWethFor(hre, "BDEUR", 5);
        const [wethInBdStablePriceDecimal1, bdStableInWethPriceDecimal1] = await getPrices(hre, "BDEUR");

        await simulateTimeElapseInSeconds(60);

        await swapWethFor(hre, "BDEUR", 15);
        const [wethInBdStablePriceDecimal2, bdStableInWethPriceDecimal2]  = await getPrices(hre, "BDEUR");

        expect(wethInBdStablePriceDecimal2).to.be.eq(wethInBdStablePriceDecimal1);
        expect(bdStableInWethPriceDecimal2).to.be.eq(bdStableInWethPriceDecimal1);

        await simulateTimeElapseInSeconds(oneHour);

        await updateWethPair(hre, "BDEUR");
        const [wethInBdStablePriceDecimal3, bdStableInWethPriceDecimal3] = await getPrices(hre, "BDEUR");

        expect(wethInBdStablePriceDecimal3).to.be.lt(wethInBdStablePriceDecimal1);
        expect(bdStableInWethPriceDecimal3).to.be.gt(bdStableInWethPriceDecimal1);
    });
})