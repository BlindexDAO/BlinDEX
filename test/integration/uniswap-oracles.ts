import hre from "hardhat";
import moment from "moment";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { provideLiquidity, swapWethFor, getWethOraclePrices } from "../helpers/swaps";
import { diffPctN, to_d18 } from "../../utils/NumbersHelpers";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import { getBdEu, getUser1, getWeth, getUniswapPairOracle, mintWeth, getDeployer, getTreasurySigner } from "../../utils/DeployedContractsHelpers";
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

  const oneHour = 60 * 60;

  it("should be able to update price after swap", async () => {
    const bdeu = await getBdEu(hre);
    const weth = await getWeth(hre);

    const user = await getUser1(hre);
    const deployer = await getDeployer(hre);
    const treasury = await getTreasurySigner(hre);

    await mintWeth(hre, user, to_d18(20));
    await bdeu.connect(treasury).transfer(user.address, to_d18(80)); // treasury gives user some bdeu so user can provide liquidity

    // properly initalize system
    await provideLiquidity(hre, user, weth, bdeu, to_d18(20), to_d18(80), false);
    await resetOracle(hre, "BDEU", "WETH");
    await simulateTimeElapseInSeconds(10); // wait a little bit to reflect real world scenario
    await updateOracle(hre, "BDEU", "WETH", deployer); // first immediate update by deployer
    await simulateTimeElapseInSeconds(oneHour);

    // make a swap to observer price changes
    const testUser = await hre.ethers.getNamedSigner("TEST2");
    await swapWethFor(hre, testUser, "BDEU", 5);
    await simulateTimeElapseInSeconds(2 * oneHour);

    await updateOracle(hre, "BDEU", "WETH");

    const { wethInBdStableOraclePrice, bdStableInWethOraclePrice } = await getWethOraclePrices(hre, "BDEU");

    const wethBdBeforeSwap = 80 / 20;
    const wethBdSwapPrice = 80 / (20 + 5);
    const wethBdAfterSwap = (80 - 5 * wethBdSwapPrice) / (20 + 5);
    const wethBdTwap = (1 * wethBdBeforeSwap + 2 * wethBdAfterSwap) / (1 + 2);
    const bdWethTwap = (1 * (1 / wethBdBeforeSwap) + 2 * (1 / wethBdAfterSwap)) / (1 + 2);

    const wethPricePctDiff = diffPctN(wethBdTwap, wethInBdStableOraclePrice);
    const bdEuPricePctDiff = diffPctN(bdWethTwap, bdStableInWethOraclePrice);

    console.log("wethPricePctDiff:", wethPricePctDiff);
    console.log("bdEuPricePctDiff:", bdEuPricePctDiff);

    expect(wethPricePctDiff).to.be.closeTo(0, 1e-3, "wethPricePctDiff invalid");
    expect(bdEuPricePctDiff).to.be.closeTo(0, 1e-3, "bdEuPricePctDiff invalid");
  });

  const secondsInHour = moment.duration(1, "hour").asSeconds();
  const secondsInDay = moment.duration(1, "day").asSeconds();
  const secondsInWeek = moment.duration(1, "week").asSeconds();
  const secondsInMonth = moment.duration(1, "month").asSeconds();
  for (const seconds of [0, 1, secondsInHour, secondsInDay, secondsInWeek, secondsInMonth]) {
    it(`oracle price sholud be close to spot price regardless when first oracle update happen | seconds [${seconds}]`, async () => {
      const bdeu = await getBdEu(hre);
      const weth = await getWeth(hre);

      const user = await getUser1(hre);
      const treasury = await getTreasurySigner(hre);
      const deployer = await getDeployer(hre);

      const spotWehtBdEuPrice = 4000;
      const spotBdEuWethPrice = 1 / 4000;

      await mintWeth(hre, user, to_d18(1));
      await bdeu.connect(treasury).transfer(user.address, to_d18(spotWehtBdEuPrice)); // treasury gives user some bdeu so user can provide liquidity

      // properly initalize system
      await provideLiquidity(hre, user, weth, bdeu, to_d18(1), to_d18(spotWehtBdEuPrice), false);
      await resetOracle(hre, "BDEU", "WETH");
      await simulateTimeElapseInSeconds(seconds); // wait before first oracle update
      await updateOracle(hre, "BDEU", "WETH", deployer); // allow immediate update by deployer

      const { wethInBdStableOraclePrice, bdStableInWethOraclePrice } = await getWethOraclePrices(hre, "BDEU");

      const wethPricePctDiff = diffPctN(spotWehtBdEuPrice, wethInBdStableOraclePrice);
      const bdEuPricePctDiff = diffPctN(spotBdEuWethPrice, bdStableInWethOraclePrice);

      console.log("wethPricePctDiff:", wethPricePctDiff);
      console.log("bdEuPricePctDiff:", bdEuPricePctDiff);

      expect(wethPricePctDiff).to.be.closeTo(0, 1e-4, "wethPricePctDiff invalid");
      expect(bdEuPricePctDiff).to.be.closeTo(0, 1e-4, "bdEuPricePctDiff invalid");
    });
  }

  it("should not update price before one hour elapses", async () => {
    const bdeu = await getBdEu(hre);
    const weth = await getWeth(hre);

    const user = await getUser1(hre);
    const treasury = await getTreasurySigner(hre);

    await mintWeth(hre, user, to_d18(20));

    await bdeu.connect(treasury).transfer(user.address, to_d18(80)); // treasury gives user some bdeu so user can provide liquidity
    await provideLiquidity(hre, user, weth, bdeu, to_d18(20), to_d18(80), false);
    await resetOracle(hre, "BDEU", "WETH");

    const testUser = await hre.ethers.getNamedSigner("TEST2");
    await swapWethFor(hre, testUser, "BDEU", 5);

    let oracle = await getUniswapPairOracle(hre, "BDEU", "WETH");
    oracle = oracle.connect(user); // this restriction doesn't apply to the owner

    await expectToFail(() => oracle.updateOracle(), "UniswapPairOracle: PERIOD_NOT_ELAPSED");
  });
});
