import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat"
import { Updater } from "../../typechain/Updater";
import { getBdEu, getBdEuWethPool, getBdx, getBot, getDeployer, getTreasury, getUniswapFactory, getUniswapPair, getUniswapPairOracle, getUniswapRouter, getWeth } from "../../utils/DeployedContractsHelpers";
import { getPools, tokensDecimals, updateUniswapPairsOracles } from "../../utils/UniswapPoolsHelpers";
import { BDStable } from "../../typechain/BDStable";
import { UniswapPairOracle } from "../../typechain/UniswapPairOracle";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Updater", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    const oneHour = 60 * 60;

    it.only("should work", async () => {
        const bot = await getBot(hre);
        const updater = await hre.ethers.getContract('Updater', bot) as Updater;
        const deployer = await getDeployer(hre);

        const pools = await getPools(hre);
        let uniOracles: UniswapPairOracle[] = [];
        for (let pool of pools) {
            const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
            uniOracles.push(oracle);
        }
        const bdeu = await getBdEu(hre) as BDStable;

        simulateTimeElapseInSeconds(6 * oneHour);

        for (let orac of uniOracles) {
            expect(await orac.shouldUpdateOracle()).to.be.eq(true);
        }
        expect(await bdeu.shouldUpdateOracles()).to.be.eq(true);

        await (await updater.update(
            [], [],
            [], [],
            uniOracles.map(x => x.address),
            [bdeu.address]))
            .wait();

        for (let orac of uniOracles) {
            expect(await orac.shouldUpdateOracle()).to.be.eq(false);
        }
        expect(await bdeu.shouldUpdateOracles()).to.be.eq(false);
    });
})