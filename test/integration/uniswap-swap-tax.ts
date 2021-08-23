import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { 
    provideLiquidity,
} from "../helpers/swaps"
import { to_d18 } from "../../utils/Helpers"
import { getBdEu, getUser, getWeth, getUniswapFactory, getUniswapRouter } from "../helpers/common";
import { UniswapV2Pair } from "../../typechain/UniswapV2Pair";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Uniswap swap tax", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        // do NOT set up the system before these tests.
        // this test tests oracles in isolation
    });

    it.only("should tax 90% of out to the treasury", async () => {
        const bdeu = await getBdEu(hre);
        const weth = await getWeth(hre);

        console.log("----------------1");

        const user = await getUser(hre);
        await weth.connect(user).deposit({ value: to_d18(20) });

        console.log("----------------1.1");
        await bdeu.transfer(user.address, to_d18(80)); // deployer gives user some bdeu so user can provide liquidity
        console.log("----------------1.2");
        await provideLiquidity(hre, user, weth, bdeu, to_d18(20), to_d18(80));
        
        console.log("----------------1.3");
        const uniswapFactory = await getUniswapFactory(hre);
        const uniswapRouter = await getUniswapRouter(hre);

        const pairAddress = await uniswapFactory.getPair(weth.address, bdeu.address);
        console.log("----------------2: " + pairAddress);

        const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;

        await pair.setMinimumSwapsDelayInBlocks(1000);

        console.log("----------------3");

        await uniswapRouter.connect(user).swapExactETHForTokens(
            0,
            [weth.address, bdeu.address], user.address,
            Date.now() + 3600,
            {
                value: to_d18(1)
            });

        await uniswapRouter.connect(user).swapExactETHForTokens(
            0,
            [weth.address, bdeu.address], user.address,
            Date.now() + 3600,
            {
                value: to_d18(1)
            });
    });
})