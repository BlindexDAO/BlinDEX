
import hre from "hardhat";
import chai from "chai";
import { solidity, MockContract } from "ethereum-waffle";
import { BigNumber, Signer } from "ethers";
import ERC20abi from '../erc20.abi.json'
import { FraxPool__factory } from '../../typechain/factories/FraxPool__factory';
import { FraxPool } from "../../typechain/FraxPool";
import { BDXShares } from "../../typechain/BDXShares";

chai.use(solidity);
const { expect } = chai;
describe("BdxShares", () => {
  let pool: BDXShares;
  let mockTimelock: MockContract;
  let sender: Signer;
  beforeEach(async () => {
    await hre.waffle.loadFixture(fixture);
  });

  async function fixture() {
    [sender] = await hre.ethers.getSigners();
    mockTimelock = await hre.waffle.deployMockContract(sender, await (await hre.artifacts.readArtifact('Timelock')).abi);
    // 1
    const signers = await hre.ethers.getSigners();
    // 2
    // const BDXSharesDeployment = await hre.deployments.deploy(
    //   "BDXShares",
    //   { from: signers[0].address, args: [
    //     "BDXShares",
    //     "BDX",
    //     hre.ethers.utils.getAddress('0'),
    //     signers[0].address,
    //     signers[0].address,
    //     mockTimelock.address
    //   ] }
    // );
  }

  describe("getCollateralPrice", async () => {
    it("should get collateral price", async () => {
      // await mockFRAX.mock.eth_usd_price.returns(10)
      // const mockUniPairOracle = await hre.waffle.deployMockContract(sender, await (await hre.artifacts.readArtifact('UniswapPairOracle')).abi);
      // await mockUniPairOracle.mock.consult.returns(100)
      // await pool.setCollatETHOracle(mockUniPairOracle.address, mockWETH.address);
      // let count = await pool.getCollateralPrice();
      // expect(count).to.eq(100000);
    });
  })
});