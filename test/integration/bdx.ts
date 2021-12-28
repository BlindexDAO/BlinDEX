import hre, { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { to_d18 } from "../../utils/NumbersHelpers";
import { getBdx, getDeployer } from "../../utils/DeployedContractsHelpers";
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BDX", () => {
  beforeEach(async () => {
    await hre.deployments.fixture();
    await setUpFunctionalSystemForTests(hre, 1);
  });

  it("should mint max total supply of BDX", async () => {
    const bdx = await getBdx(hre);

    const expected = to_d18(21e6);
    const actual = await bdx.totalSupply();

    expect(actual).to.be.eq(expected);
  });

  it("should NOT exceed max total supply of BDX", async () => {
    const bdx = await getBdx(hre);
    const deployer = await getDeployer(hre);

    await expect(
      (async () => {
        await bdx.mint(ethers.constants.AddressZero, deployer.address, 1);
      })()
    ).to.be.rejectedWith("BDX limit reached");
  });

  it("should be able to add a new bdstable", async () => {
    const bdx = await getBdx(hre);
    const numberOfStables = (await bdx.getBdStablesLength()).toNumber();

    const tx = await bdx.addBdStableAddress(bdx.address);
    const newNumberOfStables = (await bdx.getBdStablesLength()).toNumber();
    expect(newNumberOfStables).to.eql(numberOfStables + 1);
    expect(await bdx.bdstables(newNumberOfStables - 1)).to.eql(bdx.address);
    expect(tx).to.emit(bdx, "BdStableAddressAdded").withArgs(bdx.address);
  });

  it("should NOT be able to add a new bdstable", async () => {
    const bdx = await getBdx(hre);
    const numberOfStables = (await bdx.getBdStablesLength()).toNumber();

    let tx = await bdx.addBdStableAddress(bdx.address);
    const newNumberOfStables = (await bdx.getBdStablesLength()).toNumber();
    expect(newNumberOfStables).to.eql(numberOfStables + 1);
    expect(await bdx.bdstables(newNumberOfStables - 1)).to.eql(bdx.address);
    expect(tx).to.emit(bdx, "BdStableAddressAdded").withArgs(bdx.address);

    // Trying to add the same address again
    tx = await bdx.addBdStableAddress(bdx.address);
    const secondTimeNumberOfStables = (await bdx.getBdStablesLength()).toNumber();

    expect(secondTimeNumberOfStables).to.eql(newNumberOfStables);
    expect(await bdx.bdstables(secondTimeNumberOfStables - 1)).to.eql(bdx.address);
    expect(tx).to.not.emit(bdx, "BdStableAddressAdded").withArgs(bdx.address);
  });
});
