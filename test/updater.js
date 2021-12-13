const { expect } = require("chai");
const { d12_ToNumber, d18_ToNumber, to_d12, to_d18 } = require("../utils/NumbersHelpers");

describe("Updater", function () {

    let Updater;
    let updater;

    let owner;
    let addr1;
    let addr2;
    let addrs;

    before(async function () {
        Updater = await ethers.getContractFactory("Updater");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
        updater = await Updater.deploy();
        await updater.deployed();
    });

    describe("update oracles", function () {
        it("update oracles", async function () {
            const oraclesAddresses = [addr1.address];
            const prices = [to_d12(4694.94)]
            await updater.updateOraclesWithVerification(oraclesAddresses, prices);
        });
    });
})