import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { getBdUs, getBdx, getDeployer, getUser1, getUser2 } from "../../utils/DeployedContractsHelpers";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { expectEventWithArgs, expectToFail } from "../helpers/common";
import { BdStablePool, BDXShares, DummyERC20 } from "../../typechain";
import { to_d12 } from "../../utils/NumbersHelpers";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("BdStablePool emergency", () => {
  let randomUser: SignerWithAddress;
  let emergencyExecutor: SignerWithAddress;
  let owner: SignerWithAddress;

  let stablePool: BdStablePool;
  let bdx: BDXShares;

  async function deploy() {
    const bdUs = await getBdUs(hre);

    const dummyErc20Factory = await hre.ethers.getContractFactory("DummyERC20");
    const dummyErc20 = (await dummyErc20Factory.connect(owner).deploy()) as DummyERC20;
    await dummyErc20.deployed();

    const stablePoolFactory = await hre.ethers.getContractFactory("BdStablePool", {
      libraries: {
        BdPoolLibrary: (await hre.ethers.getContract("BdPoolLibrary")).address
      }
    });
    stablePool = (await stablePoolFactory.connect(owner).deploy()) as BdStablePool;
    await stablePool.deployed();
    await stablePool.initialize(bdUs.address, bdx.address, dummyErc20.address, await dummyErc20.decimals(), false);
  }

  before(async () => {
    randomUser = await getUser1(hre);
    emergencyExecutor = await getUser2(hre);
    owner = await getDeployer(hre);

    bdx = await getBdx(hre);

    await deploy();

    await stablePool.connect(owner).setEmergencyExecutor(emergencyExecutor.address);
  });

  it("Setting emergency executor", async () => {
    expectToFail(() => stablePool.connect(randomUser).setEmergencyExecutor(randomUser.address), "Ownable: caller is not the owner");
  });

  it("Toggling minting paused", async () => {
    expectToFail(() => stablePool.connect(randomUser).toggleMintingPaused(), "BdStablePool: You are not the owner or an emergency executor");

    await stablePool.connect(emergencyExecutor).toggleMintingPaused();

    const mintingPausedBefore = await stablePool.mintPaused();
    const tx = await stablePool.connect(owner).toggleMintingPaused();
    expectEventWithArgs(await tx.wait(), "MintingPausedToggled", [!mintingPausedBefore]);
    expect(await stablePool.mintPaused()).to.eq(!mintingPausedBefore);
  });

  it("Toggling redeeming paused", async () => {
    expectToFail(() => stablePool.connect(randomUser).toggleRedeemingPaused(), "BdStablePool: You are not the owner or an emergency executor");

    await stablePool.connect(emergencyExecutor).toggleRedeemingPaused();

    const redeemingPausedBefore = await stablePool.redeemPaused();
    const tx = await stablePool.connect(owner).toggleRedeemingPaused();
    expectEventWithArgs(await tx.wait(), "RedeemingPausedToggled", [!redeemingPausedBefore]);
    expect(await stablePool.redeemPaused()).to.eq(!redeemingPausedBefore);
  });

  it("Toggle recollateralize paused", async () => {
    expectToFail(() => stablePool.connect(randomUser).toggleRecollateralizePaused(), "BdStablePool: You are not the owner or an emergency executor");

    await stablePool.connect(emergencyExecutor).toggleRecollateralizePaused();

    const recollateralizePausedBefore = await stablePool.recollateralizePaused();
    const tx = await stablePool.connect(owner).toggleRecollateralizePaused();
    expectEventWithArgs(await tx.wait(), "RecollateralizePausedToggled", [!recollateralizePausedBefore]);
    expect(await stablePool.recollateralizePaused()).to.eq(!recollateralizePausedBefore);
  });

  it("Toggle buyback paused", async () => {
    expectToFail(() => stablePool.connect(randomUser).toggleBuybackPaused(), "BdStablePool: You are not the owner or an emergency executor");

    await stablePool.connect(emergencyExecutor).toggleBuybackPaused();

    const buybackPausedBefore = await stablePool.buyBackPaused();
    const tx = await stablePool.connect(owner).toggleBuybackPaused();
    expectEventWithArgs(await tx.wait(), "BuybackPausedToggled", [!buybackPausedBefore]);
    expect(await stablePool.buyBackPaused()).to.eq(!buybackPausedBefore);
  });

  it("Toggle collateral price paused", async () => {
    expectToFail(
      () => stablePool.connect(randomUser).toggleCollateralPricePaused(to_d12(10)),
      "BdStablePool: You are not the owner or an emergency executor"
    );

    await stablePool.connect(emergencyExecutor).toggleCollateralPricePaused(to_d12(10));

    let collateralPricePausedBefore = await stablePool.collateralPricePaused();
    if (collateralPricePausedBefore) {
      // we need collateralPricePaused == false in order to observe price change
      await stablePool.connect(emergencyExecutor).toggleCollateralPricePaused(to_d12(10));
      collateralPricePausedBefore = await stablePool.collateralPricePaused();
    }
    const newPrice = to_d12(20);
    const tx = await stablePool.connect(owner).toggleCollateralPricePaused(newPrice);
    expectEventWithArgs(await tx.wait(), "CollateralPriceToggled", [!collateralPricePausedBefore, newPrice]);
    expect(await stablePool.pausedPrice()).to.eq(newPrice);
    expect(await stablePool.collateralPricePaused()).to.eq(!collateralPricePausedBefore);
  });
});
