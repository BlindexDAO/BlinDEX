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
import { to_d18 } from "../../utils/NumbersHelpers"
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat"
import { getBdEu, getUser, getWeth, getBdx } from "../../utils/DeployedContractsHelpers";
import { resetOracle, updateOracle } from "../../utils/UniswapPoolsHelpers";
import { expectToFail } from "../helpers/common";

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

    it("should be able to update price after swap", async () => {
        const bdeu = await getBdEu(hre);
        const weth = await getWeth(hre);

        const user = await getUser(hre);
        
        await weth.connect(user).deposit({ value: to_d18(20) });
        await bdeu.transfer(user.address, to_d18(80)); // deployer gives user some bdeu so user can provide liquidity

        await provideLiquidity(hre, user, weth, bdeu, to_d18(20), to_d18(80));
        await resetOracle(hre, bdeu, weth);

        await simulateTimeElapseInSeconds(oneHour);
        await swapWethFor(hre, "BDEU", 5);
        await simulateTimeElapseInSeconds(2*oneHour);

        await updateOracle(hre, bdeu, weth);

        const [wethInBdStablePriceDecimal1, bdStableInWethPriceDecimal1] = await getPrices(hre, "BDEU");

        const wethBdBeforeSwap = 80/20;
        const wethBdSwapPrice = 80/(20+5)
        const wethBdAfterSwap = (80-5*wethBdSwapPrice)/(20+5);
        const wethBdTwap = (1*wethBdBeforeSwap + 2*wethBdAfterSwap) / (1+2);
        const bdWethTwap = (1*(1/wethBdBeforeSwap) + 2*(1/wethBdAfterSwap)) / (1+2);

        expect(wethInBdStablePriceDecimal1).to.be.closeTo(wethBdTwap, 1e-2);
        expect(bdStableInWethPriceDecimal1).to.be.closeTo(bdWethTwap, 1e-2);
    });

    it("should not update price before one hour elapses", async () => {
        const bdeu = await getBdEu(hre);
        const weth = await getWeth(hre);

        const user = await getUser(hre);
        
        await weth.connect(user).deposit({ value: to_d18(20) });
        await bdeu.transfer(user.address, to_d18(80)); // deployer gives user some bdeu so user can provide liquidity
        await provideLiquidity(hre, user, weth, bdeu, to_d18(20), to_d18(80));
        await resetOracle(hre, bdeu, weth);

        await swapWethFor(hre, "BDEU", 5);

        await expectToFail(() => updateOracle(hre, bdeu, weth), 'UniswapPairOracle: PERIOD_NOT_ELAPSED');
    });
})