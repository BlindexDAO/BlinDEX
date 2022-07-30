# Upgrading contracts

Disclaimer: This manual applies to [hardhat-deploy](https://github.com/wighawag/hardhat-deploy) deployment scripts

## Standard upgrade procedure

For a contract deployed this way:

```
  const coinDeployment = await hre.deployments.deploy("SampleCoin", {
    from: deployerAddress,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      execute: {
        init: { // optional post initializer function
          methodName: "initialize",
          args: ["SC", "Sample coin"]
        }
      }
    },
    contract: "SampleCoin", // original implementation
    args: []
  });
```

The upgrade script would look like this:

```
  hre.deployments.deploy("SampleCoin", {
    from: deployerAddress,
    proxy: {
      proxyContract: "OptimizedTransparentProxy",
      execute: { // optional post upgrade function 
        methodName: "postUpgrade",
        args: [12345]
      }
    },
    contract: "SampleCoinV2", // new implementation (you can also modify the original contact)
    args: []
  })
```

When you deploy your first upgradable contract, a `ProxyAdmin.sol` contract is automatically being deployed. This is the contract through which we're actually performing upgrades on our upgradable contracts. Initially, the owner of the ProxyAdmin is it's deployer (**local** account).

As long as the ProxyAdmin owner is a local account, the upgrades are smooth. This however isn't the target approach due to being vulerable to private key leaks.

After the initial deployment, the ownership of all of the contracts **inluding ProxyAdmin** should be transferred to a multi-sig account (e.g. Gnosis-safe) - on RSK there is a [fork available here](https://rsk-gnosis-safe.com/).

## Upgrade procedure as a multi-sig account

Things get more complicated when you want to use a multi-sig account as the system owner. Once you tranfer the ownership of the ProxyAdmin:

```
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getProxyAdminFactory } from "@openzeppelin/hardhat-upgrades/dist/utils/factories";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {

  const deployer = await hre.ethers.getNamedSigner("DEPLOYER");
  const newProxyAdminOwnerAddress = "<multisig account addresss>";
  const adminFactory = await getProxyAdminFactory(hre, deployer);
  const proxyAdminAddress = (await hre.ethers.getContract("DefaultProxyAdmin")).address;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = adminFactory.attach(proxyAdminAddress) as any;

  await (await admin.transferOwnership(newProxyAdminOwnerAddress)).wait();

  return true;
};
func.id = __filename;
func.tags = ["TransferProxyAdminOwnership"];
func.dependencies = ["SampleCoin"];
export default func;
```

Subsequent upgrades won't work the old way. Now you should perform them the following way:

```
  await hre.deployments.catchUnknownSigner(
    hre.deployments.deploy("SampleCoin", {
      from: deployerAddress, // standard local deployer account
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        owner: newProxyAdminOwnerAddress, // multisig account
        execute: { // optional post upgrade function
          methodName: "postUpgrade",
          args: [12345]
        }
      },
      contract: "SampleCoinV2",
      args: []
    })
  );
```

The code above:

- will deploy the new implementation
- will show in the terminal the instruction how to replace the implementation for the proxy (which function should be executed, with which parameters)
- will update the proxy deployment json file
- will update the implementation deployment json file
- will **NOT** perform the upgrade
- will **NOT** update the deployment json file (`hre.ethers.getContract("DeploymentName")` will not work out of the box ever after the manual upgrade, unless you follow the steps below)

The next step is to run the upgrade through Gnosis web interface. In order do to so, you need to `Send` a `Contract Interaction` to the ProxyAdmin contract

- provide it's address
- provide it's ABI (can be limited to the chunk below)

  ```
  [
      {
      "constant": false,
      "inputs": [
          {
          "internalType": "contract TransparentUpgradeableProxy",
          "name": "proxy",
          "type": "address"
          },
          {
          "internalType": "address",
          "name": "implementation",
          "type": "address"
          },
          {
          "internalType": "bytes",
          "name": "data",
          "type": "bytes"
          }
      ],
      "name": "upgradeAndCall",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
      },
      {
      "constant": false,
      "inputs": [
          {
          "internalType": "contract TransparentUpgradeableProxy",
          "name": "proxy",
          "type": "address"
          },
          {
          "internalType": "address",
          "name": "implementation",
          "type": "address"
          }
      ],
      "name": "upgrade",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
      },
  ]
  ```

- provide the parameters you saw on in your terminal after running the deployment scripts
- then perform the standard multi-sig signing of the transaction

And now the final step is to run a simplified version of the deployment script:

```
  await hre.deployments.catchUnknownSigner(
    hre.deployments.deploy("SampleCoin", {
      from: deployerAddress, // standard local deployer account
      proxy: {
        proxyContract: "OptimizedTransparentProxy",
        owner: newProxyAdminOwnerAddress, // multisig account
      },
      contract: "SampleCoinV2",
      args: []
    })
  );
```

- this **will** update the deployment json file (`hre.ethers.getContract("DeploymentName")` will now work fine)
- this part is kind of cumbersome, there's an [open github ticket for this](https://github.com/wighawag/hardhat-deploy/issues/259)
