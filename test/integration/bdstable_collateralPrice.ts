import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { d12_ToNumber } from "../../utils/NumbersHelpers";
import { getBdEuWbtcPool, getBdEuWethPool } from "../../utils/DeployedContractsHelpers";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Collateral price", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();
  });

  it("should get price for weth", async () => {
    await setUpFunctionalSystemForTests(hre, 1);

    const wethPool = await getBdEuWethPool(hre);

    const expectedWethPrice = 2600; // ETH-EUR for 2022-02-06
    const precision = 0.33; // Big margin due to high crypto price volatility - can update the test less often
    const wethInEurPrice = d12_ToNumber(await wethPool.getCollateralPrice_d12());

    console.log("wethInEurPrice: " + wethInEurPrice);
    expect(wethInEurPrice).to.be.closeTo(expectedWethPrice, expectedWethPrice * precision);
  });

  it("should get price for wbtc", async () => {
    await setUpFunctionalSystemForTests(hre, 1);

    const wbtcPool = await getBdEuWbtcPool(hre);

    const expectedWbtcPrice = 36000; // BTC-EUR for 2022-02-06
    const precision = 0.33; // Big margin due to high crypto price volatility - can update the test less often
    const wbtcInEurPrice = d12_ToNumber(await wbtcPool.getCollateralPrice_d12());

    console.log("wbtcInEurPrice: " + wbtcInEurPrice);
    expect(wbtcInEurPrice).to.be.closeTo(expectedWbtcPrice, expectedWbtcPrice * precision);
  });
});
