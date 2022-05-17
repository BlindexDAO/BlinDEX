import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { to_d18 } from "../../utils/NumbersHelpers";
import { ethers } from "hardhat";
import { getBdx, getDeployer, getTreasuryAddress } from "../../utils/DeployedContractsHelpers";
import { deployContract, printAndWaitOnTransaction } from "../../utils/DeploymentHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  return await deployContract("Mint BDX", async () => {
    const deployer = await getDeployer(hre);
    const treasuryAddress = await getTreasuryAddress(hre);
    const bdx = await getBdx(hre);

    const bdx21M = to_d18(21).mul(1e6);

    // mint all of the BDX up front to the treasury
    await printAndWaitOnTransaction(await bdx.connect(deployer).mint(ethers.constants.AddressZero, treasuryAddress, bdx21M));
  });
};

func.id = __filename;
func.tags = ["BdxMint"];
func.dependencies = ["BDX"];
export default func;
