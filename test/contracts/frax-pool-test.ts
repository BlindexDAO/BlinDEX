
import hre from "hardhat";
import chai from "chai";
import { solidity, MockContract } from "ethereum-waffle";
import { BigNumber, Signer } from "ethers";
import ERC20abi from '../erc20.abi.json'
import { FraxPool__factory } from '../../typechain/factories/FraxPool__factory';
import { FraxPool } from "../../typechain/FraxPool";

chai.use(solidity);
const { expect } = chai;
describe("FraxPool", () => {
  let pool: FraxPool;
  let mockFRAX: MockContract;
  let mockFXS: MockContract;
  let mockTimelock: MockContract;
  let mockWETH: MockContract;
  let sender: Signer;
  beforeEach(async () => {
    await hre.waffle.loadFixture(fixture);
  });

  async function fixture() {
    [sender] = await hre.ethers.getSigners();
    mockFRAX = await hre.waffle.deployMockContract(sender, await (await hre.artifacts.readArtifact('FRAXStablecoin')).abi);
    mockFXS = await hre.waffle.deployMockContract(sender, await (await hre.artifacts.readArtifact('FRAXShares')).abi);
    mockTimelock = await hre.waffle.deployMockContract(sender, await (await hre.artifacts.readArtifact('Timelock')).abi);
    mockWETH = await hre.waffle.deployMockContract(sender, ERC20abi);
    await mockWETH.mock.decimals.returns(9);
    // 1
    const signers = await hre.ethers.getSigners();
    // 2
    const fraxPoolLibraryDeployment = await hre.deployments.deploy(
      "FraxPoolLibrary",
      { from: signers[0].address, args: [] }
    );
    // Linking libraries is done here via compile output identifier, but should be replaced with proper link by library name.
    pool = await new FraxPool__factory({
      __$b53467437fc8c2e6b8829f86f1a6325e5f$__: fraxPoolLibraryDeployment.address
    },
      signers[0]).deploy(mockFRAX.address, mockFXS.address, mockWETH.address, signers[0].address, mockTimelock.address, BigNumber.from(1e10).toString());
  }

  describe("getCollateralPrice", async () => {
    it("should get collateral price", async () => {
      await mockFRAX.mock.eth_usd_price.returns(10)
      const mockUniPairOracle = await hre.waffle.deployMockContract(sender, await (await hre.artifacts.readArtifact('UniswapPairOracle')).abi);
      await mockUniPairOracle.mock.consult.returns(100)
      await pool.setCollatETHOracle(mockUniPairOracle.address, mockWETH.address);
      let count = await pool.getCollateralPrice();
      expect(count).to.eq(100000);
    });
  })
});