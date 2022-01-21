import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getProxyAdminFactory } from "@openzeppelin/hardhat-upgrades/dist/utils/factories";
import { getDeployer } from "../utils/DeployedContractsHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting proxt admin ownership transfer");

  const deployer = await getDeployer(hre);
  const newProxyAdminOwnerAddress = "0xbd0e8be26c1f6a83b377fe7ee8e9664d5f969722";

  const adminFactory = await getProxyAdminFactory(hre, deployer);
  console.log("got admin factory");

  const proxyAdminAddress = (await hre.ethers.getContract("DefaultProxyAdmin")).address;
  console.log("proxy admin address:", proxyAdminAddress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = adminFactory.attach(proxyAdminAddress) as any;
  console.log("got admin", admin.address);

  const proxyAdminOwner = await admin.owner();
  console.log("updating proxy admin owner");
  console.log("newProxyAdminOwner", newProxyAdminOwnerAddress);
  console.log("proxyAdminAddress", proxyAdminOwner);

  // this should ba another migration
  await admin.transferOwnership(newProxyAdminOwnerAddress);
  console.log("transferred admin");

  console.log("finished proxt admin ownership transfer");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["TransferProxyAdminOwnership"];
func.dependencies = ["UpdaterRSK"];
export default func;
