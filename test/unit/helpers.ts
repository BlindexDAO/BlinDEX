import { BigNumber } from "ethers";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BDStable, BDXShares, DummyERC20, StakingRewardsDistribution, Vesting } from "../../typechain";
import { getDeployer } from "../../utils/DeployedContractsHelpers";
import { to_d18 } from "../../utils/NumbersHelpers";

export async function deployDummyErc20(hre: HardhatRuntimeEnvironment) {
  const owner = await getDeployer(hre);

  const factory = await hre.ethers.getContractFactory("DummyERC20");
  const contract = (await factory.connect(owner).deploy()) as DummyERC20;
  await contract.deployed();

  return contract;
}

export async function deployDummyBdStable(hre: HardhatRuntimeEnvironment, owner: SignerWithAddress, treasury: SignerWithAddress, bdxAddress: string) {
  const factory = await hre.ethers.getContractFactory("BDStable");
  const contract = (await factory.connect(owner).deploy()) as BDStable;
  await contract.deployed();
  await contract.initialize("BDTest", "BDDTest", treasury.address, bdxAddress, to_d18(100));

  return contract;
}

export async function deployDummyBdx(hre: HardhatRuntimeEnvironment, owner: SignerWithAddress) {
  const factory = await hre.ethers.getContractFactory("BDXShares");
  const contract = (await factory.connect(owner).deploy()) as BDXShares;
  await contract.deployed();
  await contract.initialize("DummyBDX", "DummyBDX");

  return contract;
}

export async function deployDummyVesting(hre: HardhatRuntimeEnvironment, owner: SignerWithAddress, stakingTokenAddress: string) {
  const factory = await hre.ethers.getContractFactory("Vesting");
  const contract = (await factory.connect(owner).deploy()) as Vesting;
  await contract.deployed();
  await contract.initialize(stakingTokenAddress, owner.address, owner.address, 3600);

  return contract;
}

export async function deployDummyStakingRewardsDistribution(
  hre: HardhatRuntimeEnvironment,
  owner: SignerWithAddress,
  treasury: SignerWithAddress,
  bdxAddress: string,
  vestingAddress: string
) {
  const factory = await hre.ethers.getContractFactory("StakingRewardsDistribution");
  const contract = (await factory.connect(owner).deploy()) as StakingRewardsDistribution;
  await contract.deployed();
  await contract.initialize(bdxAddress, vestingAddress, treasury.address, BigNumber.from(100));

  return contract;
}
