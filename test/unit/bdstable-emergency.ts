import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { getBdx, getDeployer, getTreasurySigner, getUser1, getUser2 } from "../../utils/DeployedContractsHelpers";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { expectEventWithArgs, expectToFail } from "../helpers/common";
import { BDStable, BDXShares } from "../../typechain";
import { to_d12, to_d18 } from "../../utils/NumbersHelpers";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BdStable emergency", () => {
  let randomUser: SignerWithAddress;
  let emergencyExecutor: SignerWithAddress;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;

  let stable: BDStable;
  let bdx: BDXShares;

  async function deploy() {
    const factory = await hre.ethers.getContractFactory("BDStable");
    stable = (await factory.connect(owner).deploy()) as BDStable;
    await stable.deployed();
    await stable.initialize("BDTest", "BDDTest", treasury.address, bdx.address, to_d18(100));
  }

  before(async () => {
    randomUser = await getUser1(hre);
    emergencyExecutor = await getUser2(hre);
    owner = await getDeployer(hre);
    treasury = await getTreasurySigner(hre);

    bdx = await getBdx(hre);

    await deploy();

    await stable.connect(owner).setEmergencyExecutor(emergencyExecutor.address);
  });

  it("Toggling recollateralize paused", async () => {
    expectToFail(() => stable.connect(randomUser).setEmergencyExecutor(randomUser.address), "Ownable: caller is not the owner");
  });

  it("Toggling recollateralize paused", async () => {
    expectToFail(() => stable.connect(randomUser).toggleCollateralRatioPaused(), "You are not the owner or an emergency executor");

    await stable.connect(emergencyExecutor).toggleCollateralRatioPaused();

    const collaterlRatioPausedBefore = await stable.collateral_ratio_paused();
    const tx = await stable.connect(owner).toggleCollateralRatioPaused();
    expectEventWithArgs(await tx.wait(), "CollateralRatioPausedToggled", [!collaterlRatioPausedBefore]);
    expect(await stable.collateral_ratio_paused()).to.eq(!collaterlRatioPausedBefore);
  });

  it("Locking collateral ratio at", async () => {
    expectToFail(() => stable.connect(randomUser).lockCollateralRatioAt(1e12), "You are not the owner or an emergency executor");

    await stable.connect(emergencyExecutor).lockCollateralRatioAt(1e12);

    const newCr = to_d12(0.123);
    const tx = await stable.connect(owner).lockCollateralRatioAt(newCr);
    expectEventWithArgs(await tx.wait(), "CollateralRatioLocked", [newCr]);
    expect(await stable.global_collateral_ratio_d12()).to.eq(newCr);
  });
});
