import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import * as constants from "../utils/Constants";
import { getBdx, getTreasury } from "../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting: transfer BDX to locking contract");

  const treasury = await getTreasury(hre);
  const bdx = await getBdx(hre);

  const tx = await bdx.connect(treasury).transfer(constants.rskLockingContractAddress, constants.bdxLockAmount);
  await tx.wait();

  console.log("finished: transfer BDX to locking contract");
  return true;
};

func.id = __filename;
func.tags = ["LockBDX"];
func.dependencies = ["BdxMint"];
export default func;
