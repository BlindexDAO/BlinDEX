import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct, to_d12, to_d8 } from "../../utils/Helpers";
import { to_d18, d18_ToNumber, d12_ToNumber, bigNumberToDecimal } from "../../utils/Helpers"
import { getBdEur, getBdx, getWeth, getWbtc, getBdEurWbtcPool, getBdEurWethPool, getDeployer, getUser } from "../helpers/common";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";
chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Collateral price", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    it("should get price for weth", async () => {

        await setUpFunctionalSystem(hre, 1);

        const wethPool = await getBdEurWethPool(hre);

        const expectedWethPrice = 2000;
        const wethInEurPrice = d12_ToNumber(await wethPool.getCollateralPrice_d12());

        console.log("wethInEurPrice: " + wethInEurPrice);
        expect(wethInEurPrice).to.be.closeTo(expectedWethPrice, expectedWethPrice*0.33);
    });

    it("should get price for wbtc", async () => {

        await setUpFunctionalSystem(hre, 1);

        const wbtcPool = await getBdEurWbtcPool(hre);

        const expectedWbtcPrice = 30000;
        const wbtcInEurPrice = d12_ToNumber(await wbtcPool.getCollateralPrice_d12());

        console.log("wbtcInEurPrice: " + wbtcInEurPrice);
        expect(wbtcInEurPrice).to.be.closeTo(expectedWbtcPrice, expectedWbtcPrice*0.33);
    });
})
