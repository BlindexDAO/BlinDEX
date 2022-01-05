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
import "hardhat-gas-reporter";
import * as path from "path";

const envPath = path.join(__dirname, "./.env");
dotenv.config({ path: envPath });

developmentTasks.load();
maintenanceTasks.load();
setupTasks.load();
feConfig.load();
npmTasks.load();

export const typechainOutDir = "typechain";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: process.env.MAINNET_URL!
      },
      accounts: {
        mnemonic: process.env.MNEMONIC_PHRASE!,
        accountsBalance: "100000000000000000000000"
      },
      chainId: 1337
    },
    mainnetFork: {
      url: "http://localhost:8545",
      timeout: 60000,
      gas: 10_000_000
    },
    rsk: {
      url: "https://public-node.rsk.co",
      accounts: [process.env.USER_DEPLOYER_PRIVATE_KEY!, process.env.USER_TREASURY_PRIVATE_KEY!, process.env.USER_BOT_PRIVATE_KEY!],
      timeout: 6_000_000,
      gasPrice: 79240000,
      chainId: 30
    }
  },
  solidity: {
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
  },
  mocha: {
    timeout: 20000000
  },
  typechain: {
    outDir: typechainOutDir,
    target: "ethers-v5",
    externalArtifacts: [
      "./node_modules/@uniswap/v2-core/build/UniswapV2Pair.json",
      "./node_modules/@uniswap/v2-core/build/UniswapV2Pair__factory.json",
      "./node_modules/@uniswap/v2-core/build/UniswapV2Factory.json",
      "./node_modules/@uniswap/v2-core/build/UniswapV2Factory__factory.json",
      "./node_modules/@uniswap/v2-periphery/build/UniswapV2Router02.json",
      "./node_modules/@uniswap/v2-periphery/build/UniswapV2Router02__factors.json"
    ]
  },
  external: {
    contracts: [
      {
        artifacts: "node_modules/@uniswap/v2-core/build"
      },
      {
        artifacts: "node_modules/@uniswap/v2-periphery/build"
      }
    ]
  },
  gasReporter: {
    currency: "USD",
    coinmarketcap: process.env.CMC_TOKEN
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
    DEV_TREASURY: {
      default: 3
    },
    TEST1: {
      default: 4
    },
    TEST2: {
      default: 5
    },
    TEST_VESTING_SCHEDULER: {
      default: 6
    },
    TEST_VESTING_REWARDS_PROVIDER: {
      default: 7
    }
  }
};

export default config;

//Make hardhat runs faster by specifying TS_NODE_TRANSPILE_ONLY=1 (https://hardhat.org/guides/typescript.html#performance-optimizations)
