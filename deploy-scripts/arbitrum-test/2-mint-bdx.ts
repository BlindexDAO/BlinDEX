import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { to_d18 } from "../../utils/NumbersHelpers";
import { ethers } from "hardhat";
import { getBdx, getDeployer, getTreasurySigner } from "../../utils/DeployedContractsHelpers";
import { deployContract } from "../../utils/DeploymentHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  return await deployContract("Mint BDX", async () => {
    const deployer = await getDeployer(hre);
    const treasury = await getTreasurySigner(hre);
    const bdx = await getBdx(hre);

    // mint all of the BDX up front to the treasury
    await (await bdx.connect(deployer).mint(ethers.constants.AddressZero, treasury.address, to_d18(21).mul(1e6))).wait();
  });
};

func.id = __filename;
func.tags = ["BdxMint"];
func.dependencies = ["BDX"];
export default func;
