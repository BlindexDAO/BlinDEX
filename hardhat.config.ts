/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Dirty hack to enforce hardhat-deploy-ethers type precedence over hardhat-ethers, while making hardhat-deploy-ethers extendEnvironment function execute last
// import type * as deployEthers from "hardhat-deploy-ethers";
// eslint-disable-next-line
import type * as deployEthers from "hardhat-deploy-ethers";

import type { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-deploy-ethers";
import "hardhat-deploy";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-waffle";
import dotenv from "dotenv";
import * as setupTasks from "./tasks/setup";
import * as maintenanceTasks from "./tasks/mainternace";
import * as developmentTasks from "./tasks/development";
import * as feConfig from "./tasks/config";
import * as npmTasks from "./tasks/npm";
import { load as lpTasksLoad } from "./tasks/liquidity-pools";
import { load as bdStablePoolsTasksLoad } from "./tasks/bd-stable-pools";
import { load as bdStableTasksLoad } from "./tasks/bd-stable";
import { load as stakingTasksLoad } from "./tasks/staking";
import { load as usersLoad } from "./tasks/users";
import { load as tokenListLoad } from "./tasks/token-list";
import "hardhat-gas-reporter";
import * as path from "path";
import hardhatCompileConfig from "./hardhat.compile.config";
import { chainIds } from "./utils/Constants";
import { chainsDeployScriptsFolders } from "./deploy-scripts/deploy-scripts-constants";
import "@nomiclabs/hardhat-etherscan";

const envPath = path.join(__dirname, "./.env");
dotenv.config({ path: envPath });

developmentTasks.load();
maintenanceTasks.load();
setupTasks.load();
feConfig.load();
npmTasks.load();
lpTasksLoad();
bdStablePoolsTasksLoad();
bdStableTasksLoad();
stakingTasksLoad();
usersLoad();
tokenListLoad();

const config: HardhatUserConfig = {
  defaultNetwork: hardhatCompileConfig.defaultNetwork,
  networks: {
    hardhat: {
      forking: {
        url: process.env.MAINNET_URL!
      },
      accounts: {
        mnemonic: process.env.MNEMONIC_PHRASE!,
        accountsBalance: "100000000000000000000000"
      },
      chainId: chainIds.mainnetFork
    },
    mainnetFork: {
      url: "http://localhost:8545",
      timeout: 60000,
      gas: 10_000_000,
      deploy: chainsDeployScriptsFolders[chainIds.mainnetFork]
    },
    goerli: {
      url: process.env.GOERLI_URL!,
      accounts: [process.env.USER_DEPLOYER_PRIVATE_KEY!, process.env.USER_TREASURY_PRIVATE_KEY!, process.env.USER_BOT_PRIVATE_KEY!],
      deploy: chainsDeployScriptsFolders[chainIds.goerli]
    },
    arbitrumTestnet: {
      url: process.env.ARBITRUM_TESTNET_URL || "https://rinkeby.arbitrum.io/rpc",
      accounts: [process.env.USER_DEPLOYER_PRIVATE_KEY!, process.env.USER_TREASURY_PRIVATE_KEY!, process.env.USER_BOT_PRIVATE_KEY!],
      chainId: chainIds.arbitrumTestnet,
      deploy: chainsDeployScriptsFolders[chainIds.arbitrumTestnet]
    },
    rsk: {
      url: "https://public-node.rsk.co",
      accounts: [process.env.USER_DEPLOYER_PRIVATE_KEY!, process.env.USER_TREASURY_PRIVATE_KEY!, process.env.USER_BOT_PRIVATE_KEY!],
      timeout: 6_000_000,
      gasPrice: 79240000,
      chainId: chainIds.rsk,
      deploy: chainsDeployScriptsFolders[chainIds.rsk]
    }
  },
  solidity: hardhatCompileConfig.solidity,
  mocha: {
    timeout: 20000000
  },
  typechain: hardhatCompileConfig.typechain,
  external: hardhatCompileConfig.external,
  gasReporter: {
    currency: "USD",
    coinmarketcap: process.env.CMC_TOKEN
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  namedAccounts: {
    DEPLOYER: {
      default: 0
    },
    TREASURY: {
      default: 1
    },
    BOT: {
      default: 2
    },
    TEST1: {
      default: 3
    },
    TEST2: {
      default: 4
    },
    TEST_VESTING_SCHEDULER: {
      default: 5
    },
    TEST_VESTING_REWARDS_PROVIDER: {
      default: 6
    }
  }
};

export default config;

// Local development optimization suggestion:
// Make hardhat run faster by specifying TS_NODE_TRANSPILE_ONLY = 1(https://hardhat.org/guides/typescript.html#performance-optimizations)
