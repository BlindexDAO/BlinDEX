import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { getDeployer, getTreasurySigner, getUser1, getUser2 } from "../../utils/DeployedContractsHelpers";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";
import { expectEventWithArgs, expectToFail } from "../helpers/common";
import { BDStable } from "../../typechain";
import { to_d12 } from "../../utils/NumbersHelpers";
import { deployDummyBdStable, deployDummyBdx } from "./helpers";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BDStable emergency", () => {
  let randomUser: SignerWithAddress;
  let emergencyExecutor: SignerWithAddress;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;

  let stable: BDStable;

  async function deploy() {
    const bdx = await deployDummyBdx(hre, owner);
    stable = await deployDummyBdStable(hre, owner, treasury, bdx.address);
  }

  before(async () => {
    randomUser = await getUser1(hre);
    emergencyExecutor = await getUser2(hre);
    owner = await getDeployer(hre);
    treasury = await getTreasurySigner(hre);

    await deploy();

    await stable.connect(owner).setEmergencyExecutor(emergencyExecutor.address);
  });

  it("Setting emergency executor", async () => {
    await expectToFail(() => stable.connect(randomUser).setEmergencyExecutor(randomUser.address), "Ownable: caller is not the owner");
  });

  it("Toggling recollateralize paused", async () => {
    await expectToFail(() => stable.connect(randomUser).toggleCollateralRatioPaused(), "BDStable: You are not the owner or an emergency executor");

    await stable.connect(emergencyExecutor).toggleCollateralRatioPaused();

    const collaterlRatioPausedBefore = await stable.collateral_ratio_paused();
    const tx = await stable.connect(owner).toggleCollateralRatioPaused();
    expectEventWithArgs(await tx.wait(), "CollateralRatioPausedToggled", [!collaterlRatioPausedBefore]);
    expect(await stable.collateral_ratio_paused()).to.eq(!collaterlRatioPausedBefore);
  });

  it("Locking collateral ratio at", async () => {
    await expectToFail(() => stable.connect(randomUser).lockCollateralRatioAt(1e12), "BDStable: You are not the owner or an emergency executor");

    await stable.connect(emergencyExecutor).lockCollateralRatioAt(1e12);

    const newCr = to_d12(0.123);
    const tx = await stable.connect(owner).lockCollateralRatioAt(newCr);
    expectEventWithArgs(await tx.wait(), "CollateralRatioLocked", [newCr]);
    expect(await stable.global_collateral_ratio_d12()).to.eq(newCr);
  });
});
