import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import type { TransactionRelay } from "../../typechain/TransactionRelay";
import { getDeployer, getStakingRewardsDistribution, getUser1, getUser2 } from "../../utils/DeployedContractsHelpers";
import { StakingRewardsDistribution } from "../../typechain/StakingRewardsDistribution";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

async function GetTransactionRelay() {
  const transactionRelay = (await hre.ethers.getContract("TransactionRelay")) as TransactionRelay;
  return transactionRelay;
}

async function CreateTransactionAs(creator: SignerWithAddress) {
  const transactionRelay = (await GetTransactionRelay()).connect(creator);

  const stakingRewardsDistribution = await getStakingRewardsDistribution(hre);

  const tx = await transactionRelay.createTransaction(
    stakingRewardsDistribution.address,
    0,
    "",
    stakingRewardsDistribution.interface.encodeFunctionData("setVestingRewardRatio", [13])
  );

  const receipt = await tx.wait();
  const createTransactionEventsArgs = receipt.events?.find(e => e.event === "CreateTransaction")?.args;

  let txHash: string;
  if (createTransactionEventsArgs) {
    txHash = createTransactionEventsArgs[0];
  } else {
    throw new Error("Missing event");
  }

  return txHash;
}

describe.only("Execute with transaction relay", () => {
  let relay: TransactionRelay;
  let stakingRewardsDistribution: StakingRewardsDistribution;
  let deployer: SignerWithAddress;
  let multisigImposter: SignerWithAddress;
  let randomUser: SignerWithAddress;

  beforeEach(async () => {
    await hre.deployments.fixture();

    deployer = await getDeployer(hre);
    multisigImposter = await getUser1(hre);
    randomUser = await getUser2(hre);

    relay = await GetTransactionRelay();
    await relay.transferOwnership(multisigImposter.address);

    stakingRewardsDistribution = await getStakingRewardsDistribution(hre);
    await stakingRewardsDistribution.transferOwnership(relay.address);
  });

  it("Should execute transaction as target contract owner", async () => {
    const txHash = await CreateTransactionAs(randomUser);

    const ratioBefore = await stakingRewardsDistribution.vestingRewardRatio_percent();

    expect(ratioBefore).to.not.eq(13);

    await relay.connect(multisigImposter).executeTransaction(txHash, randomUser.address);

    const ratioAfter = await stakingRewardsDistribution.vestingRewardRatio_percent();
    expect(ratioAfter).to.eq(13);
  });

  it("Execute transaction as not target contract owner should revert", async () => {
    const txHash = await CreateTransactionAs(randomUser);

    await expect(relay.connect(randomUser).executeTransaction(txHash, randomUser.address)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Contract should revert if called by old owner", async () => {
    await expect(stakingRewardsDistribution.connect(deployer).setVestingRewardRatio(13)).to.be.revertedWith("Ownable: caller is not the owner");
  });
});
