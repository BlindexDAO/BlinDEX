import { HardhatUserConfig, task } from "hardhat/config";
// Dirty hack to enforce hardhat-deploy-ethers type precedence over hardhat-ethers, while making hardhat-deploy-ethers extendEnvironment function execute last 
import type * as deployEthers from "hardhat-deploy-ethers";
import "@nomiclabs/hardhat-ethers";
import '@openzeppelin/hardhat-upgrades';
import "hardhat-deploy-ethers";
import 'hardhat-deploy';
import "hardhat-typechain";
import "@nomiclabs/hardhat-waffle";
import dotenv from 'dotenv'
import { BigNumber } from 'ethers';
import { ethers } from "hardhat";
const fs = require('fs');
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

task("test:dir")
  .addFlag("deployFixture", 'run the global fixture before tests')
  .addPositionalParam(
    "testDir",
    "Directory with *.ts files. Sholud end with '/'"
  )
  .setAction(
    async (
      { testDir, noCompile, deployFixture },
      { run, network }
    ) => {

    const testFiles: string[] = []
    fs.readdir(testDir, (err: string, files: string[]) => {
      files.forEach(file => {
        if(file.endsWith(".ts")){
          file = testDir + file;
          testFiles.push(file);
        }
      });
    });
    await run("test", { testFiles, noCompile, deployFixture } );
  });


  task("setup:account")
    .setAction(async (args, hre) => {
      
      // send ether
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: ["0xbe0eb53f46cd790cd13851d5eff43d12404d33e8"]
      });

      const signer = await hre.ethers.getSigner("0xbe0eb53f46cd790cd13851d5eff43d12404d33e8");

      const resp = await signer.sendTransaction({to:'0x774289Cb40c98B4f5b64a152BF7e5F94Fee38669', value: hre.ethers.utils.parseEther("7.5")});
      console.log(resp);

      // send dai
      const dai = '0x6b175474e89094c44da98b954eedeac495271d0f'
      const bigDaiHolder = '0x66c57bf505a85a74609d2c83e94aabb26d691e1f'
      await hre.ethers.provider.send(
        "hardhat_impersonateAccount",
        [bigDaiHolder]
      )
      const signerLink = hre.ethers.provider.getSigner(bigDaiHolder)
      const DaiContractFactory = await hre.ethers.getContractFactory("ERC20", signerLink);
      const DaiContract = DaiContractFactory.attach(dai);
      const transferTransaction = await DaiContract.transfer('0x774289Cb40c98B4f5b64a152BF7e5F94Fee38669', BigNumber.from('10000000000000000000'))
      await hre.ethers.provider.send(
        "hardhat_stopImpersonatingAccount",
        [bigDaiHolder]
      )
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
      // accounts: {
      //   mnemonic: process.env.MNEMONIC_PHRASE!,
      // }
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

    DEPLOYER_ADDRESS: {
      default: 0
    },
    COLLATERAL_FRAX_AND_FXS_OWNER: {
      default: 1
    },
    ORACLE_ADDRESS: {
      default: 2
    },
    POOL_CREATOR: {
      default: 3
    },
    TIMELOCK_ADMIN: {
      default: 4
    },
    GOVERNOR_GUARDIAN_ADDRESS: {
      default: 5
    },
    STAKING_OWNER: {
      default: 6
    },
    STAKING_REWARDS_DISTRIBUTOR: {
      default: 7
    },
    TEST1: {
      default: 8
    },
    TEST2: {
      default: 8
    }
  }
};

export default config

//Make hardhat runs faster by specifying TS_NODE_TRANSPILE_ONLY=1 (https://hardhat.org/guides/typescript.html#performance-optimizations)
