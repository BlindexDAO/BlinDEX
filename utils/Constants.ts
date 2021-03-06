import type { BigNumber } from "ethers";
import _ from "lodash";
import { ChainlinkPriceFeed, ChainSpecificComponents, MultichainAddresses, SupportedERC20Token } from "./interfaces/constants.interface";
import { to_d18 } from "./NumbersHelpers";

export const wrappedNativeTokenData: SupportedERC20Token = {
  mainnetFork: { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  rsk: { symbol: "WRBTC", address: "0x542fDA317318eBF1d3DEAf76E0b632741A7e677d", decimals: 18 }, // Since RBTC is the native token on RSK
  arbitrumTestnet: { symbol: "WETH", address: "0xEBbc3452Cc911591e4F18f3b36727Df45d6bd1f9", decimals: 18 }
};

export const wrappedSecondaryTokenData: SupportedERC20Token = {
  mainnetFork: { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  rsk: { symbol: "ETHs", address: "0x1D931Bf8656d795E50eF6D639562C5bD8Ac2B78f", decimals: 18 }, // Since RBTC is the native token on RSK
  arbitrumTestnet: { symbol: "WBTC", address: "0x1F7dC0B961950c69584d0F9cE290A918124d32CD", decimals: 8 }
};

// TODO: Multichain - Do we really need it when Blindex doesn't host the DEX?
export const EXTERNAL_USD_STABLE: SupportedERC20Token = {
  mainnetFork: { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  rsk: { symbol: "XUSD", address: "0xb5999795BE0EbB5bAb23144AA5FD6A02D080299F", decimals: 18 }
};

// TODO: Multichain - Do we really need it when Blindex doesn't host the DEX?
export const SECONDARY_EXTERNAL_USD_STABLE: SupportedERC20Token = {
  mainnetFork: { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  rsk: { symbol: "DOC", address: "0xe700691dA7b9851F2F35f8b8182c69c53CcaD9Db", decimals: 18 }
};

export const EXTERNAL_SUPPORTED_TOKENS = [EXTERNAL_USD_STABLE, SECONDARY_EXTERNAL_USD_STABLE];

// TODO: Multichain - Do we really need it?
export const NATIVE_TOKEN_NAME: { [key: string]: string } = {
  mainnetFork: "ETH",
  rsk: "RBTC",
  arbitrumTestnet: "ETH"
};

// TODO: Multichain - Do we really need it?
export const SECONDARY_COLLATERAL_TOKEN_NAME: { [key: string]: string } = {
  mainnetFork: "BTC",
  rsk: "ETHs",
  arbitrumTestnet: "WBTC"
};

export const PriceFeedContractNames = {
  EUR_USD: "PriceFeed_EUR_USD",
  XAU_USD: "PriceFeed_XAU_USD",
  GBP_USD: "PriceFeed_GBP_USD",
  ETH_USD: "PriceFeed_ETH_USD",
  BTC_ETH: "BtcToEthOracle",
  ETH_XAU: "OracleBasedCryptoFiatFeed_ETH_XAU",
  ETH_GBP: "OracleBasedCryptoFiatFeed_ETH_GBP",
  ETH_EUR: "OracleBasedCryptoFiatFeed_ETH_EUR",
  ETH_USD_ADAPTER: "OracleBasedWethUSDFeed_ETH_USD"
};

// TODO: Multichain - Maybe combine it with the price feeds we deploy? That way we could have a field called "shouldUpdate" and the BE bot could read it to know if it should update it or not. That way we won't need it hardcoded on the BE config like it is right now (in the updaterSettings section in the BE environment file). https://lagoslabs.atlassian.net/browse/LAGO-890
export const chainlinkPriceFeeds: { [key: string]: ChainlinkPriceFeed } = {
  EUR_USD_FEED_ADDRESS: {
    mainnetFork: {
      address: "0xb49f677943BC038e9857d61E7d053CaA2C1734C1"
    }
  },
  XAU_USD_FEED_ADDRESS: {
    mainnetFork: {
      address: "0x214ed9da11d2fbe465a6fc601a91e62ebec1a0d6"
    }
  },
  GBP_USD_FEED_ADDRESS: {
    mainnetFork: {
      address: "0x5c0ab2d9b5a7ed9f470386e82bb36a3613cdd4b5"
    }
  },
  ETH_USD_FEED_ADDRESS: {
    mainnetFork: {
      address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"
    },
    arbitrumTestnet: {
      address: "0x5f0423B1a6935dc5596e7A24d98532b67A0AeFd8"
    }
  },
  BTC_USD_FEED_ADDRESS: {
    // This is not being used today as it was only needed on RSK but we don't yet have Chainlink there.
    // Keeping it here for future use when Chainlink will deploy on RSK.
    mainnetFork: {
      address: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c"
    },
    arbitrumTestnet: {
      address: "0x0c9973e7a27d00e656B9f153348dA46CaD70d03d"
    }
  },
  BTC_ETH_FEED_ADDRESS: {
    mainnetFork: {
      address: "0xdeb288F737066589598e9214E782fa5A8eD689e8"
    },
    arbitrumTestnet: {
      address: "0x6eFd3CCf5c673bd5A7Ea91b414d0307a5bAb9cC1"
    }
  }
};

export const chainSpecificComponents: ChainSpecificComponents = {
  mainnetFork: {
    uniswapRouterAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
  },
  rsk: {
    sovrynNetwork: "0x98AcE08d2B759A265ae326f010496BCd63c15Afc",
    teamLockingContract: "0x4292Ef0D3AfA1052605e2D706349dFe3A481cDcF"
  }
};

export const botAddress: MultichainAddresses = {
  rsk: "0x2A119532248d0E4Ff68A42bB37f64336C3F20872",
  arbitrumTestnet: "0x2A119532248d0E4Ff68A42bB37f64336C3F20872",
  goerli: "0x2A119532248d0E4Ff68A42bB37f64336C3F20872",
  kovan: "0x2A119532248d0E4Ff68A42bB37f64336C3F20872"
};

export const treasuryAddresses: MultichainAddresses = {
  rsk: "0x18bc35c3b74b35c70cff0ec14ad62f4a8c2e679c",
  arbitrumTestnet: "0xb2952754fe429D30Dd799149A1a47dD17c035dba",
  goerli: "0xb2952754fe429D30Dd799149A1a47dD17c035dba",
  kovan: "0xb2952754fe429D30Dd799149A1a47dD17c035dba"
};

export const INITIAL_BDX_AMOUNT_FOR_BDSTABLE = to_d18(6e4);
export const INITIAL_BDEU_AMOUNT_FOR_BDUS_POOL = 500;
export const INITIAL_USDC_UNISWAP_USD_AMOUNT = 100;
export const INITIAL_DAI_UNISWAP_USD_AMOUNT = 100;

export const initialLiquidityForPoolsWithCollateral = {
  rsk: {
    BDUS: 500,
    BDEU: 500,
    bXAU: 0.05,
    bGBP: 75
  },
  mainnetFork: {
    BDUS: 500,
    BDEU: 500,
    bXAU: 1,
    bGBP: 500
  }
};

export const initialLiquidityForPoolsWithBDX = {
  rsk: {
    BDEU: 9e3,
    BDUS: 10e3,
    bXAU: 0.05,
    bGBP: 75
  },
  mainnetFork: {
    BDEU: 9e3,
    BDUS: 10e3,
    bXAU: 2,
    bGBP: 9e3
  }
};

const initalBbstableForMinting = {
  rsk: {
    BDUS: to_d18(15e3),
    BDEU: to_d18(15e3),
    bXAU: to_d18(0.1),
    bGBP: to_d18(150)
  },
  mainnetFork: {
    BDUS: to_d18(30e3),
    BDEU: to_d18(30e3),
    bXAU: to_d18(30),
    bGBP: to_d18(30e3)
  }
};

export const blockTimeSeconds: { [key: string]: number } = {
  rsk: 30,
  mainnetFork: 14,
  arbitrumTestnet: 13,
  kovan: 4,
  goerli: 15
};

export const initialBdstableMintingAmount = (networkName: string, symbol: string): BigNumber => {
  const initalAmountPerSymbol = symbol && _.get(initalBbstableForMinting, [networkName, symbol]);
  if (!initalAmountPerSymbol) {
    throw new Error(`Missing initial BDStable minting amount for ${symbol} on network ${networkName}`);
  }
  return initalAmountPerSymbol;
};

export const BlindexFileBaseUrl = "https://blindex-static-assets.s3.filebase.com";
export const BlindexTokensIconsFileBaseUrl = `${BlindexFileBaseUrl}/tokens-icons`;

export const BlindexLogoUrl = `${BlindexFileBaseUrl}/blindex-symbol-white-stroke.svg`;
export const tokenLogoUrl: { [symbol: string]: string } = {
  BDX: `${BlindexFileBaseUrl}/BDX.svg`,
  BDEU: `${BlindexFileBaseUrl}/BDEU.svg`,
  BDUS: `${BlindexFileBaseUrl}/BDUS.svg`,
  WRBTC: `${BlindexFileBaseUrl}/BTC.svg`,
  ETHs: `${BlindexFileBaseUrl}/ETH.svg`,
  XUSD: `${BlindexFileBaseUrl}/XUSD.svg`,
  DOC: `${BlindexFileBaseUrl}/DOC.svg`
};

export function getListOfSupportedLiquidityPools(networkName: string): {
  tokenA: string;
  tokenB: string;
  hasStakingPool: boolean;
}[] {
  return [
    { tokenA: "BDX", tokenB: "WETH", hasStakingPool: true },
    { tokenA: "BDX", tokenB: "WBTC", hasStakingPool: true },

    // BDUS
    { tokenA: "BDUS", tokenB: "WETH", hasStakingPool: true },
    { tokenA: "BDUS", tokenB: "WBTC", hasStakingPool: true },
    { tokenA: "BDX", tokenB: "BDUS", hasStakingPool: true },
    { tokenA: "BDUS", tokenB: "BDEU", hasStakingPool: true },
    { tokenA: "BDUS", tokenB: EXTERNAL_USD_STABLE[networkName].symbol, hasStakingPool: true }, // XUSD on rsk, USDC on mainnetFork
    { tokenA: "BDUS", tokenB: SECONDARY_EXTERNAL_USD_STABLE[networkName].symbol, hasStakingPool: true }, // DOC on rsk, DAI on mainnetFork

    // BDEU
    { tokenA: "BDEU", tokenB: "WETH", hasStakingPool: true },
    { tokenA: "BDEU", tokenB: "WBTC", hasStakingPool: true },
    { tokenA: "BDX", tokenB: "BDEU", hasStakingPool: true },

    // bXAU
    { tokenA: "bXAU", tokenB: "WETH", hasStakingPool: true },
    { tokenA: "BDX", tokenB: "bXAU", hasStakingPool: true },

    // bGBP
    { tokenA: "bGBP", tokenB: "WETH", hasStakingPool: true },
    { tokenA: "BDX", tokenB: "bGBP", hasStakingPool: true }
  ];
}

export const BASE_STAKING_MULTIPLIER = 1e6;

export const chainIds = {
  mainnetFork: 1337,
  rsk: 30,
  arbitrumTestnet: 421611,
  goerli: 420,
  kovan: 42
};

export const chainNames = {
  mainnetFork: "mainnetFork",
  rsk: "rsk",
  arbitrumTestnet: "arbitrumTestnet",
  goerli: "goerli",
  kovan: "kovan"
};
