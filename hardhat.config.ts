import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import 'hardhat-deploy';
import "hardhat-typechain"
import dotenv from 'dotenv'
const path = require('path');
const envPath = path.join(__dirname, './.env');
dotenv.config({ path: envPath });

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});


const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: process.env.MAINNET_URL!
      },
      accounts: {
        mnemonic: process.env.MNEMONIC_PHRASE!,
        accountsBalance: '134439500000000000000000',
      },
      chainId: 1337
    },
    mainnetFork: {
      url: 'http://localhost:8545',
      accounts: {
        mnemonic: process.env.MNEMONIC_PHRASE!,
      }
    },
  },
  solidity: {
    version: "0.6.11",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  mocha: {
    timeout: 20000000
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
};

export default config

//Make hardhat runs faster by specifying TS_NODE_TRANSPILE_ONLY=1 (https://hardhat.org/guides/typescript.html#performance-optimizations)
