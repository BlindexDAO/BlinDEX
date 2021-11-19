import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { 
    provideLiquidity,
} from "../helpers/swaps"
import { to_d18 } from "../../utils/Helpers"
import { getBdEu, getUser, getTreasury, getWeth, getUniswapFactory, getUniswapRouter } from "../helpers/common";
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

    it("should tax 90% to the treasury after 2 immediate opposite swaps", async () => {
        const bdeu = await getBdEu(hre);
        const weth = await getWeth(hre);

        const user = await getUser(hre);
        const treasury = await getTreasury(hre);

        await weth.connect(user).deposit({ value: to_d18(30) });
        await bdeu.transfer(user.address, to_d18(100)); // deployer gives user some bdeu so user can provide liquidity

        await provideLiquidity(hre, user, weth, bdeu, to_d18(20), to_d18(80));
        
        const uniswapFactory = await getUniswapFactory(hre);
        const uniswapRouter = await getUniswapRouter(hre);

        const pairAddress = await uniswapFactory.getPair(weth.address, bdeu.address);

        const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;

        //============= illegal swaps margin ==============//
        //todo ag
        //await pair.setMinimumSwapsDelayInBlocks(1000);

        await weth.connect(user).approve(uniswapRouter.address, to_d18(10));
        await uniswapRouter.connect(user).swapTokensForExactTokens(
            to_d18(1),  // amount out
            to_d18(10), // max in
            [weth.address, bdeu.address],
            user.address,
            Date.now() + 3600);

        var userWethBalanceBefore = await weth.balanceOf(user.address);
        var treasuryWethBalanceBefore = await weth.balanceOf(treasury.address);

        await bdeu.connect(user).approve(uniswapRouter.address, to_d18(10));
        await uniswapRouter.connect(user).swapTokensForExactTokens(
            to_d18(1),  // amount out
            to_d18(10), // max in
            [bdeu.address, weth.address],
            user.address,
            Date.now() + 3600);

        var userWethBalanceAfter = await weth.balanceOf(user.address);
        var treasuryWethBalanceAfter = await weth.balanceOf(treasury.address);

        const userWethDiff = userWethBalanceAfter.sub(userWethBalanceBefore);
        const treasuryWethDiff = treasuryWethBalanceAfter.sub(treasuryWethBalanceBefore);

        console.log("userWethDiff: " + userWethDiff);
        console.log("treasuryWethDiff: " + treasuryWethDiff);

        expect(treasuryWethDiff).to.be.gt(0, "test validation failed, treasuryWethDiff should be > 0");
        expect(userWethDiff).to.be.gt(0, "test validation failed, userWethDiff should be > 0");
        expect(treasuryWethDiff).to.be.eq(userWethDiff.mul(9))
    });

    it("should NOT tax 2 immediate NON-opposite swaps", async () => {
        const bdeu = await getBdEu(hre);
        const weth = await getWeth(hre);

        const user = await getUser(hre);
        const treasury = await getTreasury(hre);

        await weth.connect(user).deposit({ value: to_d18(30) });
        await bdeu.transfer(user.address, to_d18(100)); // deployer gives user some bdeu so user can provide liquidity

        await provideLiquidity(hre, user, weth, bdeu, to_d18(20), to_d18(80));
        
        const uniswapFactory = await getUniswapFactory(hre);
        const uniswapRouter = await getUniswapRouter(hre);

        const pairAddress = await uniswapFactory.getPair(weth.address, bdeu.address);

        const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;

        //todo ag
        // await pair.setMinimumSwapsDelayInBlocks(1000);

        await weth.connect(user).approve(uniswapRouter.address, to_d18(10));
        await uniswapRouter.connect(user).swapTokensForExactTokens(
            to_d18(1),  // amount out
            to_d18(10), // max in
            [weth.address, bdeu.address],
            user.address,
            Date.now() + 3600);

        var userWethBalanceBefore = await weth.balanceOf(user.address);
        var treasuryWethBalanceBefore = await weth.balanceOf(treasury.address);

        await bdeu.connect(user).approve(uniswapRouter.address, to_d18(10));
        await uniswapRouter.connect(user).swapTokensForExactTokens(
            to_d18(1),  // amount out
            to_d18(10), // max in
            [weth.address, bdeu.address],
            user.address,
            Date.now() + 3600);

        var userWethBalanceAfter = await weth.balanceOf(user.address);
        var treasuryWethBalanceAfter = await weth.balanceOf(treasury.address);

        const userWethDiff = userWethBalanceAfter.sub(userWethBalanceBefore);
        const treasuryWethDiff = treasuryWethBalanceAfter.sub(treasuryWethBalanceBefore);

        console.log("userWethDiff: " + userWethDiff);
        console.log("treasuryWethDiff: " + treasuryWethDiff);

        expect(treasuryWethDiff).to.be.eq(0, "test validation failed, treasuryWethDiff should be = 0");
        expect(userWethDiff).to.be.lt(0, "test validation failed, userWethDiff should be > 0");
    });

    it("should NOT tax 2 NON-immediate opposite swaps", async () => {
        const bdeu = await getBdEu(hre);
        const weth = await getWeth(hre);

        const user = await getUser(hre);
        const treasury = await getTreasury(hre);

        await weth.connect(user).deposit({ value: to_d18(30) });
        await bdeu.transfer(user.address, to_d18(100)); // deployer gives user some bdeu so user can provide liquidity

        await provideLiquidity(hre, user, weth, bdeu, to_d18(20), to_d18(80));
        
        const uniswapFactory = await getUniswapFactory(hre);
        const uniswapRouter = await getUniswapRouter(hre);

        const pairAddress = await uniswapFactory.getPair(weth.address, bdeu.address);

        const pair = await hre.ethers.getContractAt("UniswapV2Pair", pairAddress) as UniswapV2Pair;

        //============= illegal swaps margin to 0 essentially allowing for immediate swaps ==============//
        //todo ag
        // await pair.setMinimumSwapsDelayInBlocks(0);

        await weth.connect(user).approve(uniswapRouter.address, to_d18(10));
        await uniswapRouter.connect(user).swapTokensForExactTokens(
            to_d18(1),  // amount out
            to_d18(10), // max in
            [weth.address, bdeu.address],
            user.address,
            Date.now() + 3600);

        var userWethBalanceBefore = await weth.balanceOf(user.address);
        var treasuryWethBalanceBefore = await weth.balanceOf(treasury.address);

        await bdeu.connect(user).approve(uniswapRouter.address, to_d18(10));
        await uniswapRouter.connect(user).swapTokensForExactTokens(
            to_d18(1),  // amount out
            to_d18(10), // max in
            [bdeu.address, weth.address],
            user.address,
            Date.now() + 3600);

        var userWethBalanceAfter = await weth.balanceOf(user.address);
        var treasuryWethBalanceAfter = await weth.balanceOf(treasury.address);

        const userWethDiff = userWethBalanceAfter.sub(userWethBalanceBefore);
        const treasuryWethDiff = treasuryWethBalanceAfter.sub(treasuryWethBalanceBefore);

        console.log("userWethDiff: " + userWethDiff);
        console.log("treasuryWethDiff: " + treasuryWethDiff);

        expect(treasuryWethDiff).to.be.eq(0, "test validation failed, treasuryWethDiff should be = 0");
        expect(userWethDiff).to.be.gt(0, "test validation failed, userWethDiff should be > 0");
    });
})