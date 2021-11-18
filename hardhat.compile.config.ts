import { HardhatUserConfig } from 'hardhat/types';
import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-dependency-compiler'

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
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
  dependencyCompiler: {
    paths: [
      '@uniswap/v2-core/contracts/UniswapV2Pair.sol',
      '@uniswap/v2-core/contracts/UniswapV2Factory.sol',
      '@uniswap/v2-periphery/contracts/UniswapV2Router02.sol',
    ],
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
    // externalArtifacts: [
    //   './node_modules/@uniswap/v2-core/build/[!C]*.json', //excluding Combined-Json.json file
    //   './node_modules/@uniswap/v2-periphery/build/[!C]*.json',
    // ]
  },
};

export default config