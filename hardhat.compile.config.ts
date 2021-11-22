import { HardhatUserConfig } from 'hardhat/types';
import '@typechain/hardhat';
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-dependency-compiler'
import 'hardhat-deploy';

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
    ],
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
    externalArtifacts: [
      './node_modules/@uniswap/v2-core/build/UniswapV2Pair.json',
      './node_modules/@uniswap/v2-core/build/UniswapV2Pair__factory.json',
      './node_modules/@uniswap/v2-core/build/UniswapV2Factory.json',
      './node_modules/@uniswap/v2-core/build/UniswapV2Factory__factory.json',
      './node_modules/@uniswap/v2-periphery/build/UniswapV2Router02.json',
      './node_modules/@uniswap/v2-periphery/build/UniswapV2Router02__factors.json'
    ]
  },
  external: {
    contracts: [{
      artifacts: 'node_modules/@uniswap/v2-core/build'
    }, {
      artifacts: 'node_modules/@uniswap/v2-periphery/build'
    }]
  },
};

export default config