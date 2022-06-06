import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DummyERC20 } from "../../typechain";
import { getDeployer } from "../../utils/DeployedContractsHelpers";

export async function deployDummyErc20(hre: HardhatRuntimeEnvironment) {
  const owner = await getDeployer(hre);

  const dummyErc20Factory = await hre.ethers.getContractFactory("DummyERC20");
  const dummyErc20 = (await dummyErc20Factory.connect(owner).deploy()) as DummyERC20;
  await dummyErc20.deployed();

  return dummyErc20;
}
