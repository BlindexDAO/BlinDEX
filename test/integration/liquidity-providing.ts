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
import { d18_ToNumber, to_d18 } from "../../utils/Helpers"
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat"
import { getBdEu, getUser, getWeth, getBdx } from "../helpers/common";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe.only("Uniswap Oracles - providing liquidity", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        // do NOT set up the system before these tests.
        // this test tests oracles in isolation
    });

    const oneHour = 60*60;

    it("should reject adding liquidity when spot price diverges from oracle price over threshold", async () => {
        const bdeu = await getBdEu(hre);
        const weth = await getWeth(hre);

        

        const user = await getUser(hre);
        
        await weth.connect(user).deposit({ value: to_d18(40) });
        await bdeu.transfer(user.address, to_d18(160)); // deployer gives user some bdeu so user can provide liquidity
        await provideLiquidity(hre, user, weth, bdeu, to_d18(10), to_d18(40));
        
        await simulateTimeElapseInSeconds(oneHour);

        await swapWethFor(hre, "BDEU", 10);

        const {wethSpotPrice, wethOraclePrice} = await getWethPrices();
        console.log("wethSpotPrice:   " + wethSpotPrice);
        console.log("wethOraclePrice: " + wethOraclePrice);

        await expect((async () => {
            await provideLiquidity(hre, user, weth, bdeu, to_d18(10), to_d18(40));
        })()).to.be.rejectedWith("Spot vs Oracle Averaged price divergence exceedes limit", "weth, bdeu");

        await expect((async () => {
            await provideLiquidity(hre, user, bdeu, weth, to_d18(40), to_d18(10));
        })()).to.be.rejectedWith("Spot vs Oracle Averaged price divergence exceedes limit", "bedu, weth");
    });


    it("should add liquidity when spot price diverges from oracle price below the threshold", async () => {
        const bdeu = await getBdEu(hre);
        const weth = await getWeth(hre);

        const user = await getUser(hre);
        
        await weth.connect(user).deposit({ value: to_d18(40) });
        await bdeu.transfer(user.address, to_d18(160)); // deployer gives user some bdeu so user can provide liquidity
        await provideLiquidity(hre, user, weth, bdeu, to_d18(10), to_d18(40));
        
        await simulateTimeElapseInSeconds(oneHour);

        await swapWethFor(hre, "BDEU", 0.01);

        const {wethSpotPrice, wethOraclePrice} = await getWethPrices();
        console.log("wethSpotPrice:   " + wethSpotPrice);
        console.log("wethOraclePrice: " + wethOraclePrice);

        await provideLiquidity(hre, user, weth, bdeu, to_d18(10), to_d18(40));
        await provideLiquidity(hre, user, bdeu, weth, to_d18(40), to_d18(10));
    });
})

async function getWethPrices(){
    const bdeu = await getBdEu(hre);
    const weth = await getWeth(hre);

    const pair = await getWethPair(hre, "BDEU");

    const token0 = (await pair.token0()).toLowerCase();
    const token1 = (await pair.token1()).toLowerCase();
    const reservers = await pair.getReserves();
    
    let wethAmount = null;
    let bdeuAmount = null;

    if(token0 == weth.address.toLowerCase() && token1 == bdeu.address.toLowerCase()){
        wethAmount = reservers._reserve0;
        bdeuAmount = reservers._reserve1;
    } else if (token0 == bdeu.address.toLowerCase() && token1 == weth.address.toLowerCase()) {
        wethAmount = reservers._reserve1;
        bdeuAmount = reservers._reserve0;
    }

    //test validation
    expect(wethAmount).to.not.be.null;
    expect(bdeuAmount).to.not.be.null;

    const wethSpotPrice = d18_ToNumber(bdeuAmount ?? to_d18(0)) / d18_ToNumber(wethAmount ?? to_d18(0));
    const wethOraclePrice = d18_ToNumber(await pair.consult(weth.address, to_d18(1)));

    return {wethSpotPrice, wethOraclePrice};
}