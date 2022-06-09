import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { getDeployer, getTreasurySigner, getUser1, getUser2 } from "../../utils/DeployedContractsHelpers";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";
import { expectEventWithArgs, expectToFail } from "../helpers/common";
import { BdStablePool } from "../../typechain";
import { to_d12 } from "../../utils/NumbersHelpers";
import { deployDummyBdStable, deployDummyBdStablePool, deployDummyBdx, deployDummyErc20 } from "./helpers";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BdStablePool emergency", () => {
  let randomUser: SignerWithAddress;
  let emergencyExecutor: SignerWithAddress;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;

  let bdStablePool: BdStablePool;

  async function deploy() {
    const bdx = await deployDummyBdx(hre, owner);
    const bdStable = await deployDummyBdStable(hre, owner, treasury, bdx.address);
    const dummyErc20 = await deployDummyErc20(hre);

    bdStablePool = await deployDummyBdStablePool(hre, owner, bdx.address, bdStable.address, dummyErc20.address);
  }

  before(async () => {
    randomUser = await getUser1(hre);
    emergencyExecutor = await getUser2(hre);
    owner = await getDeployer(hre);
    treasury = await getTreasurySigner(hre);

    await deploy();

    await bdStablePool.connect(owner).setEmergencyExecutor(emergencyExecutor.address);
  });

  it("Setting emergency executor", async () => {
    await expectToFail(() => bdStablePool.connect(randomUser).setEmergencyExecutor(randomUser.address), "Ownable: caller is not the owner");
  });

  it("Toggling minting paused", async () => {
    await expectToFail(() => bdStablePool.connect(randomUser).toggleMintingPaused(), "BdStablePool: You are not the owner or an emergency executor");

    await bdStablePool.connect(emergencyExecutor).toggleMintingPaused();

    const mintingPausedBefore = await bdStablePool.mintPaused();
    const tx = await bdStablePool.connect(owner).toggleMintingPaused();
    expectEventWithArgs(await tx.wait(), "MintingPausedToggled", [!mintingPausedBefore]);
    expect(await bdStablePool.mintPaused()).to.eq(!mintingPausedBefore);
  });

  it("Toggling redeeming paused", async () => {
    await expectToFail(
      () => bdStablePool.connect(randomUser).toggleRedeemingPaused(),
      "BdStablePool: You are not the owner or an emergency executor"
    );

    await bdStablePool.connect(emergencyExecutor).toggleRedeemingPaused();

    const redeemingPausedBefore = await bdStablePool.redeemPaused();
    const tx = await bdStablePool.connect(owner).toggleRedeemingPaused();
    expectEventWithArgs(await tx.wait(), "RedeemingPausedToggled", [!redeemingPausedBefore]);
    expect(await bdStablePool.redeemPaused()).to.eq(!redeemingPausedBefore);
  });

  it("Toggle recollateralize paused", async () => {
    await expectToFail(
      () => bdStablePool.connect(randomUser).toggleRecollateralizePaused(),
      "BdStablePool: You are not the owner or an emergency executor"
    );

    await bdStablePool.connect(emergencyExecutor).toggleRecollateralizePaused();

    const recollateralizePausedBefore = await bdStablePool.recollateralizePaused();
    const tx = await bdStablePool.connect(owner).toggleRecollateralizePaused();
    expectEventWithArgs(await tx.wait(), "RecollateralizePausedToggled", [!recollateralizePausedBefore]);
    expect(await bdStablePool.recollateralizePaused()).to.eq(!recollateralizePausedBefore);
  });

  it("Toggle buyback paused", async () => {
    await expectToFail(() => bdStablePool.connect(randomUser).toggleBuybackPaused(), "BdStablePool: You are not the owner or an emergency executor");

    await bdStablePool.connect(emergencyExecutor).toggleBuybackPaused();

    const buybackPausedBefore = await bdStablePool.buyBackPaused();
    const tx = await bdStablePool.connect(owner).toggleBuybackPaused();
    expectEventWithArgs(await tx.wait(), "BuybackPausedToggled", [!buybackPausedBefore]);
    expect(await bdStablePool.buyBackPaused()).to.eq(!buybackPausedBefore);
  });

  it("Toggle collateral price paused", async () => {
    await expectToFail(
      () => bdStablePool.connect(randomUser).toggleCollateralPricePaused(to_d12(10)),
      "BdStablePool: You are not the owner or an emergency executor"
    );

    await bdStablePool.connect(emergencyExecutor).toggleCollateralPricePaused(to_d12(10));

    let collateralPricePausedBefore = await bdStablePool.collateralPricePaused();
    if (collateralPricePausedBefore) {
      // we need collateralPricePaused == false in order to observe price change
      await bdStablePool.connect(emergencyExecutor).toggleCollateralPricePaused(to_d12(10));
      collateralPricePausedBefore = await bdStablePool.collateralPricePaused();
    }
    const newPrice = to_d12(20);
    const tx = await bdStablePool.connect(owner).toggleCollateralPricePaused(newPrice);
    expectEventWithArgs(await tx.wait(), "CollateralPriceToggled", [!collateralPricePausedBefore, newPrice]);
    expect(await bdStablePool.pausedPrice()).to.eq(newPrice);
    expect(await bdStablePool.collateralPricePaused()).to.eq(!collateralPricePausedBefore);
  });
});
