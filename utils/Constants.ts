import type { BigNumber } from "ethers";
import _ from "lodash";
import { ChainlinkPriceFeed, ERC20TokenData } from "./interfaces/constants.interface";
import { to_d18 } from "./NumbersHelpers";

export const wrappedNativeTokenData: { [key: string]: ERC20TokenData } = {
  mainnetFork: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18 },
  rsk: { address: "0x542fDA317318eBF1d3DEAf76E0b632741A7e677d", symbol: "WRBTC", decimals: 18 }, // Since RBTC is the native token on RSK
  arbitrumTestnet: { address: "0xEBbc3452Cc911591e4F18f3b36727Df45d6bd1f9", symbol: "WETH", decimals: 18 }
};

export const wrappedSecondaryTokenData: { [key: string]: ERC20TokenData } = {
  mainnetFork: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", decimals: 8 },
  rsk: { address: "0x1D931Bf8656d795E50eF6D639562C5bD8Ac2B78f", symbol: "ETHs", decimals: 18 }, // Since RBTC is the native token on RSK
  arbitrumTestnet: { address: "0x1F7dC0B961950c69584d0F9cE290A918124d32CD", symbol: "WBTC", decimals: 8 }
};

export const chainlinkPriceFeeds: { [key: string]: ChainlinkPriceFeed } = {
  EUR_USD_FEED_ADDRESS: {
    mainnetFork: {
      address: "0xb49f677943BC038e9857d61E7d053CaA2C1734C1"
    },
    arbitrumTestnet: null,
    rsk: null
  },
  XAU_USD_FEED_ADDRESS: {
    mainnetFork: {
      address: "0x214ed9da11d2fbe465a6fc601a91e62ebec1a0d6"
    },
    arbitrumTestnet: null,
    rsk: null
  },
  GBP_USD_FEED_ADDRESS: {
    mainnetFork: {
      address: "0x5c0ab2d9b5a7ed9f470386e82bb36a3613cdd4b5"
    },
    arbitrumTestnet: null,
    rsk: null
  },
  ETH_USD_FEED_ADDRESS: {
    mainnetFork: {
      address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"
    },
    arbitrumTestnet: {
      address: "0x5f0423B1a6935dc5596e7A24d98532b67A0AeFd8"
    },
    rsk: null
  },
  BTC_USD_FEED_ADDRESS: {
    // This is not being used today as it was only needed on RSK but we don't yet have Chainlink there.
    // Keeping it here for future use when Chainlink will deploy on RSK.
    mainnetFork: {
      address: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c"
    },
    arbitrumTestnet: {
      address: "0x0c9973e7a27d00e656B9f153348dA46CaD70d03d"
    },
    rsk: null
  },
  BTC_ETH_FEED_ADDRESS: {
    mainnetFork: {
      address: "0xdeb288F737066589598e9214E782fa5A8eD689e8"
    },
    arbitrumTestnet: {
      address: "0x6eFd3CCf5c673bd5A7Ea91b414d0307a5bAb9cC1"
    },
    rsk: null
  }
};

export const NATIVE_TOKEN_NAME: { [key: string]: string } = {
  mainnetFork: "ETH",
  rsk: "RBTC"
};

export const SECONDARY_COLLATERAL_TOKEN_NAME: { [key: string]: string } = {
  mainnetFork: "BTC",
  rsk: "ETHs"
};

export const INITIAL_BDX_AMOUNT_FOR_BDSTABLE = to_d18(6e4);
export const INITIAL_BDEU_AMOUNT_FOR_BDUS_POOL = 500;
export const INITIAL_USDC_UNISWAP_USD_AMOUNT = 100;

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

export const initialBdstableMintingAmount = (networkName: string, symbol: string): BigNumber => {
  const initalAmountPerSymbol = symbol && _.get(initalBbstableForMinting, [networkName, symbol]);
  if (!initalAmountPerSymbol) {
    throw new Error(`Missing initial BDStable minting amount for ${symbol} on network ${networkName}`);
  }
  return initalAmountPerSymbol;
};

// original uniswap addresss on ETH
export const ETH_uniswapRouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

export const RSK_RUSDT_ADDRESS = "0xEf213441a85DF4d7acBdAe0Cf78004E1e486BB96";
export const RSK_WRBTC_ADDRESS = "0x542FDA317318eBf1d3DeAF76E0B632741a7e677d";
export const RSK_ETHS_ADDRESS = "0x1D931BF8656D795e50Ef6d639562C5bD8AC2b78F";
export const RSK_XUSD_ADDRESS = "0xb5999795BE0EbB5bAb23144AA5FD6A02D080299F";

export const RSK_SOVRYN_NETWORK = "0x98AcE08d2B759A265ae326f010496BCd63c15Afc";

export const botAddress = "0x2A119532248d0E4Ff68A42bB37f64336C3F20872";
export const rskMultisigTreasuryAddress = "0x18bc35c3b74b35c70cff0ec14ad62f4a8c2e679c";

export const bdxLockAmount = to_d18(3150000);
export const bdxLockingContractAddressRSK = "0x4292Ef0D3AfA1052605e2D706349dFe3A481cDcF";

export const ETH_USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // usdc on eth

export const EXTERNAL_USD_STABLE: { [key: string]: { symbol: string; address: string; decimals: number } } = {
  mainnetFork: { symbol: "USDC", address: ETH_USDC_ADDRESS, decimals: 6 },
  rsk: { symbol: "XUSD", address: RSK_XUSD_ADDRESS, decimals: 18 }
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
  XUSD: `${BlindexFileBaseUrl}/XUSD.svg`
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

export function getListOfSupportedLiquidityPools(networkName: string): {
  tokenA: string;
  tokenB: string;
}[] {
  const externalUsdStable = EXTERNAL_USD_STABLE[networkName];
  return [
    { tokenA: "BDX", tokenB: "WETH" },
    { tokenA: "BDX", tokenB: "WBTC" },

    // BDUS
    { tokenA: "BDUS", tokenB: "WETH" },
    { tokenA: "BDUS", tokenB: "WBTC" },
    { tokenA: "BDX", tokenB: "BDUS" },
    { tokenA: "BDUS", tokenB: "BDEU" },
    { tokenA: "BDUS", tokenB: externalUsdStable.symbol },

    // BDEU
    { tokenA: "BDEU", tokenB: "WETH" },
    { tokenA: "BDEU", tokenB: "WBTC" },
    { tokenA: "BDX", tokenB: "BDEU" },

    // bXAU
    { tokenA: "bXAU", tokenB: "WETH" },
    { tokenA: "BDX", tokenB: "bXAU" },

    // bGBP
    { tokenA: "bGBP", tokenB: "WETH" },
    { tokenA: "BDX", tokenB: "bGBP" }
  ];
}

export const BASE_STAKING_MULTIPLIER = 1e6;

export const chainIds = {
  mainnetFork: 1337,
  rsk: 30
};
