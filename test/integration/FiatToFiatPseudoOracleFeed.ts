import cap from "chai-as-promised";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import hre, { ethers, upgrades } from "hardhat";
import { getDeployer } from "../../utils/DeployedContractsHelpers";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { FiatToFiatPseudoOracleFeed } from "../../typechain/FiatToFiatPseudoOracleFeed";
import { simulateTimeElapseInDays, simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat";
import { to_d12 } from "../../utils/NumbersHelpers";
import { expectToFail } from "../helpers/common";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

const startPrice = 1.15;

let deployer: SignerWithAddress;
let updater: SignerWithAddress;
let testUser: SignerWithAddress;
let oracle: FiatToFiatPseudoOracleFeed;

describe("FiatToFiatPseudoOracleFeed", () => {
  before(async () => {
    deployer = await getDeployer(hre);
    updater = await hre.ethers.getNamedSigner("TEST1");
    testUser = await hre.ethers.getNamedSigner("TEST2");
  });
  beforeEach(async () => {
    const oracleFactory = await ethers.getContractFactory("FiatToFiatPseudoOracleFeed");
    oracle = (await oracleFactory.deploy(updater.address, to_d12(startPrice))) as FiatToFiatPseudoOracleFeed;
  });

  it("should get initial price", async () => {
    const price = await oracle.price();
    expect(price).eq(to_d12(startPrice));
  });

  it("should update price", async () => {
    const newPrice = 1.15 * 1.01;
    await simulateTimeElapseInDays(1);

    await oracle.connect(updater).setPrice(to_d12(newPrice));

    const price = await oracle.price();
    expect(price).eq(to_d12(newPrice));
  });

  it("should not update price if change too big", async () => {
    const newPrice = 1.15 * 1.02;
    await simulateTimeElapseInDays(1);

    await expectToFail(() => oracle.connect(updater).setPrice(to_d12(newPrice)), "Price change too big");
  });

  it("should update price if change is big, but waited long enough", async () => {
    const newPrice = 1.15 * 1.02;
    await simulateTimeElapseInDays(2);
    await oracle.connect(updater).setPrice(to_d12(newPrice));

    const price = await oracle.price();
    expect(price).eq(to_d12(newPrice));
  });

  it("should not update price if not updater", async () => {
    await expectToFail(() => oracle.connect(testUser).setPrice(to_d12(1)), "You're not updater");
  });

  it("should update price even if change too big if owner", async () => {
    const newPrice = 1.15 * 2;
    await oracle.connect(deployer).setPrice(to_d12(newPrice));

    const price = await oracle.price();
    expect(price).eq(to_d12(newPrice));
  });
});
