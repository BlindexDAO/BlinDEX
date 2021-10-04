import { extendEnvironment, HardhatUserConfig, task } from "hardhat/config";
// Dirty hack to enforce hardhat-deploy-ethers type precedence over hardhat-ethers, while making hardhat-deploy-ethers extendEnvironment function execute last 
import type * as deployEthers from "hardhat-deploy-ethers";
import "@nomiclabs/hardhat-ethers";
import '@openzeppelin/hardhat-upgrades';
import "hardhat-deploy-ethers";
import 'hardhat-deploy';
import "hardhat-typechain";
//import "hardhat-ethernal";
import "@nomiclabs/hardhat-waffle";
import dotenv from 'dotenv'

const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, './.env');
dotenv.config({ path: envPath });

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: process.env.MAINNET_URL!
      },
      accounts: {
        mnemonic: process.env.MNEMONIC_PHRASE!,
        accountsBalance: '13443950000000000000000000',
      },
      chainId: 1337
    },
    mainnetFork: {
      url: 'http://localhost:8545',
      timeout: 60000
    },
    kovan: {
      url: 'https://kovan.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      accounts: [
        process.env.USER_DEPLOYER_PRIVATE_KEY!,
        process.env.USER_TREASURY_PRIVATE_KEY!
      ],
      timeout: 240000
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      {
        version: "0.8.0",
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
    outDir: "typechain",
    target: "ethers-v5",
  },
  namedAccounts: {

    DEPLOYER: {
      default: 0
    },
    TREASURY: {
      default: 1
    },
    TEST1: {
      default: 2
    },
    TEST2: {
      default: 3
    },
    TEST_VESTING_SCHEDULER: {
      default: 4
    },
    TEST_VESTING_REWARDS_PROVIDER: {
      default: 5
    }
  }
};

export default config

//Make hardhat runs faster by specifying TS_NODE_TRANSPILE_ONLY=1 (https://hardhat.org/guides/typescript.html#performance-optimizations)
