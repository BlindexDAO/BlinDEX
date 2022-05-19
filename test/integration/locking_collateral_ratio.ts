import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { d12_ToNumber, to_d18 } from "../../utils/NumbersHelpers";
import { getBdEu, getBdEuWethPool, getBdx, getTreasurySigner, getWeth } from "../../utils/DeployedContractsHelpers";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import { swapWethAsDeployer } from "../helpers/swaps";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Locking collateral ratio", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();
    await setUpFunctionalSystemForTests(hre, 0.8);

    // decrease CR so fractional minting works
    const bdEu = await getBdEu(hre);
    await swapWethAsDeployer(hre, "BDEU", 1, 1e-12);

    await simulateTimeElapseInSeconds(60 * 60 * 24);

    await bdEu.refreshCollateralRatio();
  });

  it("collateral ratio should move when unlocked", async () => {
    const bdEu = await getBdEu(hre);

    const initialCR_d12 = await bdEu.global_collateral_ratio_d12();
    const initialCR = d12_ToNumber(initialCR_d12);

    expect(initialCR).to.be.lt(1); // test validation

    await DecreaseCollateralizationAndWait();

    const actualCR_d12 = await bdEu.global_collateral_ratio_d12();
    const actualCR = d12_ToNumber(actualCR_d12);

    console.log("initialCR: " + initialCR);
    console.log("actualCR: " + actualCR);
    expect(actualCR).to.be.lt(initialCR);
  });

  it("collateral ratio NOT should move when locked", async () => {
    const bdEu = await getBdEu(hre);
    const initialCR_d12 = await bdEu.global_collateral_ratio_d12();
    const initialCR = d12_ToNumber(initialCR_d12);

    expect(initialCR).to.be.lt(1); // test validation

    await bdEu.lockCollateralRatioAt(initialCR_d12);

    await DecreaseCollateralizationAndWait();

    const actualCR_d12 = await bdEu.global_collateral_ratio_d12();
    const actualCR = d12_ToNumber(actualCR_d12);

    console.log("initialCR: " + initialCR);
    console.log("actualCR: " + actualCR);
    expect(actualCR).to.be.eq(initialCR);
  });

  async function DecreaseCollateralizationAndWait() {
    const treasury = await getTreasurySigner(hre);

    const bdEuWethPool = await getBdEuWethPool(hre);
    const weth = await getWeth(hre);
    const bdx = await getBdx(hre);

    await simulateTimeElapseInSeconds(60 * 60 * 24);

    // treasury mints some BdEu in order to natrually trigger oracles and CR update
    const collateralAmount = to_d18(0.001);
    const excessiveBdxAmount = to_d18(1000);
    await weth.connect(treasury).approve(bdEuWethPool.address, collateralAmount);
    await bdx.connect(treasury).approve(bdEuWethPool.address, excessiveBdxAmount);
    await bdEuWethPool.connect(treasury).mintFractionalBdStable(collateralAmount, excessiveBdxAmount, 1, false, {});
  }
});
