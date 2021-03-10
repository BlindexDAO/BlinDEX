import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { FraxPool } from "../../typechain/FraxPool";

chai.use(solidity);
const { expect } = chai;
describe("FraxPool", () => {
  let pool: FraxPool;

  describe("toggleCollateralPrice", async () => {
    it("should toggle collateral price", async () => {
      const poolOwnerAccount = await hre.ethers.getNamedSigner('POOL_CREATOR')
      const deployerAccount = await hre.ethers.getNamedSigner('DEPLOYER_ADDRESS')
      pool = await hre.ethers.getContract('Pool_USDC', poolOwnerAccount) as unknown as FraxPool
      await pool.setTimelock(poolOwnerAccount.address);
      await pool.connect(deployerAccount).grantRole(hre.ethers.utils.keccak256(Buffer.from("COLLATERAL_PRICE_PAUSER")), poolOwnerAccount.address)
      await pool.toggleCollateralPrice('1000');
      const price = await pool.getCollateralPrice();
      expect(price).to.eq(1000);
    });
  })
});