import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import * as constants from '../../utils/Constants'
import { 
    provideLiquidity,
    updateWethPair,
    swapWethFor,
    getPrices
} from "../helpers/swaps"
import { getWethPair } from "../../utils/Swaps"
import { to_d18 } from "../../utils/Helpers"
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat"
import { getBdEur, getUser, getWeth, getBdx } from "../helpers/common";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Uniswap Oracles", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        // do NOT set up the system before these tests.
        // this test tests oracles in isolation
    });

    const oneHour = 60*60;

    it("should update price after swap", async () => {
        const bdeur = await getBdEur(hre);
        const weth = await getWeth(hre);

        const user = await getUser(hre);
        
        await weth.connect(user).deposit({ value: to_d18(20) });
        await bdeur.transfer(user.address, to_d18(80)); // deployer gives user some bdeur so user can provide liquidity
        await provideLiquidity(hre, user, weth, bdeur, to_d18(20), to_d18(80));
        
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
        const bdeur = await getBdEur(hre);
        const weth = await getWeth(hre);

        const user = await getUser(hre);
        
        await weth.connect(user).deposit({ value: to_d18(20) });
        await bdeur.transfer(user.address, to_d18(80)); // deployer gives user some bdeur so user can provide liquidity
        await provideLiquidity(hre, user, weth, bdeur, to_d18(20), to_d18(80));
        
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