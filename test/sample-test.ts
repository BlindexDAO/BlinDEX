import hre from "hardhat";
import "@nomiclabs/hardhat-ethers";
import chai from "chai";
import { loadFixture, solidity, MockProvider, deployMockContract } from "ethereum-waffle";
import ERC20abi from './erc20.abi.json'

import { Counter } from "../typechain/Counter";
chai.use(solidity);
const { expect } = chai;
describe("Counter", () => {
  let counter: Counter;

  beforeEach(async () => {
    await loadFixture(fixture);
  });

  async function fixture() {
    const [sender, receiver] = new MockProvider().getWallets();
    const mockERC20 = await deployMockContract(sender, ERC20abi);
    // 1
    const signers = await hre.ethers.getSigners();
    // 2
    const counterFactory = await hre.ethers.getContractFactory(
      "Counter",
      signers[0]
    );
    counter = (await counterFactory.deploy()) as Counter;
    await counter.deployed();

    await mockERC20.mock.decimals.returns(9);
    console.log(await mockERC20.decimals())
  }

  beforeEach(async () => {
    const initialCount = await counter.getCount();
    // 3
    expect(initialCount).to.eq(0);
    expect(counter.address).to.properAddress;
  });
  // 4
  describe("count up", async () => {
    it("should count up", async () => {
      await counter.countUp();
      let count = await counter.getCount();
      expect(count).to.eq(1);
    });
  });
  describe("count down", async () => {
    // 5
    it("should fail", async () => {
      // this test will fail
      await counter.countDown();
    });
    it("should count down", async () => {
      await counter.countUp();
    await counter.countDown();
      const count = await counter.getCount();
      expect(count).to.eq(0);
    });
  });
});