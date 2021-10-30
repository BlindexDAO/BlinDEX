import hre, { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { to_d18 } from "../../utils/Helpers";
import { getBdx, getDeployer } from "../helpers/common";
import { setUpFunctionalSystem } from "../../utils/SystemSetup";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BDX limit", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystem(hre);
    });

    it("should mint max total supply of BDX", async () => {
        const bdx = await getBdx(hre);
        
        const expected = to_d18(21e6);
        var actual = await bdx.totalSupply();

        expect(actual).to.be.eq(expected);
    });

    it("should NOT exceed max total supply of BDX", async () => {
        const bdx = await getBdx(hre);
        const deployer = await getDeployer(hre);

        await expect((async () => {
            await bdx.mint(
                ethers.constants.AddressZero,
                deployer.address,
                1);
        })()).to.be.rejectedWith("BDX limit reached");
    });
});