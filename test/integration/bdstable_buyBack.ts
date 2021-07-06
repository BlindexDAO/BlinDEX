import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { diffPct, to_d12, to_d8 } from "../../utils/Helpers";
import { to_d18 as to_d18, d18_ToNumber, bigNumberToDecimal } from "../../utils/Helpers"
import { updateBdxOracleRefreshRatiosBdEur } from "../helpers/bdStable";
import { getBdEur, getBdx, getWeth, getWbtc, getBdEurWbtcPool, getBdEurWethPool, getDeployer, getUser } from "../helpers/common";
import { setUpFunctionalSystem } from "../helpers/SystemSetup";
import { updateWethPair, swapEthForWbtc } from "../helpers/swaps";
import { lockBdEurCrAt } from "../helpers/bdStable";
import * as constants from '../../utils/Constants';

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BuyBack", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    it.only("should buy back", async () => {        
        await setUpFunctionalSystem(hre, 0.3);

        // await lockBdEurCrAt(hre, 0.9); // CR

        const testUser = await getUser(hre);
        const weth = await getWeth(hre);
        const bdx = await getBdx(hre);
        const bdEurWethPool = await getBdEurWethPool(hre);

        const bdxAmount_d18 = to_d18(100);

        bdx.transfer(testUser.address, bdxAmount_d18.mul(3));
        
        await bdx.connect(testUser).approve(bdEurWethPool.address, bdxAmount_d18); 
        await bdEurWethPool.connect(testUser).buyBackBDX(bdxAmount_d18, 1);

        expect(1).to.be.eq(2, "saftey fail");
    })
})
