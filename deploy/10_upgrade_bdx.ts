import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("starting upgrade: bdx");

  const deployerAddress = (await hre.getNamedAccounts()).DEPLOYER;
  const newProxyAdminOwnerAddress = "0xbd0e8be26c1f6a83b377fe7ee8e9664d5f969722";

  const proxyAdminAddress = (await hre.ethers.getContract("DefaultProxyAdmin")).address;
  console.log("proxy admin address:", proxyAdminAddress);

  console.log("upgrading");

  await hre.deployments.catchUnknownSigner(
    hre.deployments.deploy("BDX", {
      from: deployerAddress,
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        owner: newProxyAdminOwnerAddress, // this address will execute
        execute: {
          methodName: "postUpgrade",
          args: [12345]
        }
      },
      contract: "BDXSharesV2",
      args: []
    })
  );

  // you could pause the deployment here and wait for input to continue

  console.log("finished deployment: bdx");

  // One time migration
  return true;
};
func.id = __filename;
func.tags = ["BDXV2"];
func.dependencies = ["TransferProxyAdminOwnership"];
export default func;
