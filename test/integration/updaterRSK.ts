import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat"
import { UpdaterRSK } from "../../typechain/UpdaterRSK";
import { getBdEu, getBot, getUser, getDeployer, getUniswapPairOracle } from "../../utils/DeployedContractsHelpers";
import { getPools } from "../../utils/UniswapPoolsHelpers";
import { BDStable } from "../../typechain/BDStable";
import { UniswapPairOracle } from "../../typechain/UniswapPairOracle";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import { expectToFail } from '../helpers/common';

chai.use(cap);
chai.use(solidity);
const { expect } = chai;

describe.only("UpdaterRSK", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystemForTests(hre, 1);
    });

    const oneHour = 60 * 60;

    it("should update", async () => {
        const bot = await getBot(hre);
        const updater = await hre.ethers.getContract('UpdaterRSK', bot) as UpdaterRSK;

        const pools = await getPools(hre);
        let uniOracles: UniswapPairOracle[] = [];
        for (let pool of pools) {
            const oracle = await getUniswapPairOracle(hre, pool[0].name, pool[1].name);
            uniOracles.push(oracle);
        }
        const bdeu = await getBdEu(hre) as BDStable;

        await simulateTimeElapseInSeconds(60 * oneHour);

        // test validation
        for (let orac of uniOracles) {
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

        //second update() in a row
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

    it("should set the updater correctly at deployment", async () => {
        const bot = await getBot(hre);
        const updater = await hre.ethers.getContract('UpdaterRSK', bot) as UpdaterRSK;

        expect(await updater.updater()).to.be.eq(bot.address);
    });

    it("should set the updater correctly with setUpdater()", async () => {
        const deployer = await getDeployer(hre);
        const user = await getUser(hre);
        const bot = await getBot(hre);
        const updater = await hre.ethers.getContract('UpdaterRSK', bot) as UpdaterRSK;

        await updater.connect(deployer).setUpdater(user.address);

        expect(await updater.updater()).to.be.eq(user.address);
    });

    it("should emit the UpdaterChanged event", async () => {
        const deployer = await getDeployer(hre);
        const user = await getUser(hre);
        const bot = await getBot(hre);
        const updater = await hre.ethers.getContract('UpdaterRSK', bot) as UpdaterRSK;

        const tx = await updater.connect(deployer).setUpdater(user.address);
        expect(tx)
            .to.emit(updater, "UpdaterChanged")
            .withArgs(bot.address, user.address);
    });

    it("should fail if not updater calls update()", async () => {
        const user = await getUser(hre);
        const bot = await getBot(hre);
        const updater = await hre.ethers.getContract('UpdaterRSK', bot) as UpdaterRSK;

        await expectToFail(() => updater.connect(user).update([], [], [], [], [], []), "You're not the updater");
    });

    it("should fail if update() provided with wrong arguments", async () => {
        const bot = await getBot(hre);
        const updater = await hre.ethers.getContract('UpdaterRSK', bot) as UpdaterRSK;

        await expectToFail(() => updater.update([], [1], [], [], [], []), "Each sovryn oracle address needs its corresponding price");
        await expectToFail(() => updater.update([], [], [], [1, 1], [], []), "Each fiat oracle address needs its corresponding price");
    });

})