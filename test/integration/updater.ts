import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat"
import { UpdaterRSK } from "../../typechain/UpdaterRSK";
import { getBdEu, getBot, getDeployer, getUniswapPairOracle } from "../../utils/DeployedContractsHelpers";
import { getPools } from "../../utils/UniswapPoolsHelpers";
import { BDStable } from "../../typechain/BDStable";
import { UniswapPairOracle } from "../../typechain/UniswapPairOracle";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("UpdaterRSK", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystemForTests(hre, 1);
    });

    const oneHour = 60 * 60;

    it.only("should update", async () => {
        const bot = await getBot(hre);
        const updater = await hre.ethers.getContract('UpdaterRSK', bot) as UpdaterRSK;

        const pools = await getPools(hre);
        let uniOracles: UniswapPairOracle[] = [];
        for (let pool of pools) {
            const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
            uniOracles.push(oracle);
        }
        const bdeu = await getBdEu(hre) as BDStable;

        const number1 = await hre.ethers.provider.getBlockNumber();
        console.log((await hre.ethers.provider.getBlock(number1)).timestamp);
        
        await simulateTimeElapseInSeconds(60 * oneHour);

        const number2 = await hre.ethers.provider.getBlockNumber();
        console.log((await hre.ethers.provider.getBlock(number2)).timestamp);
        // test validation
        for (let orac of uniOracles) {
            console.log(await orac.blockTimestampLast());
            expect(await orac.shouldUpdateOracle()).to.be.eq(true);
        }
        expect(await bdeu.when_should_refresh_collateral_ratio_in_seconds()).to.be.eq(0);

        await (await updater.update(
            [], [],
            [], [],
            uniOracles.map(x => x.address),
            [bdeu.address]))
            .wait();

        for (let orac of uniOracles) {
            expect(await orac.shouldUpdateOracle()).to.be.eq(false);
        }
        expect(await bdeu.when_should_refresh_collateral_ratio_in_seconds()).to.be.gt(0);
    });
})