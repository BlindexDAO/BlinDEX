import type { BigNumber } from "ethers";
import { to_d18 } from "./NumbersHelpers";

export const wETH_address: { [key: string]: string } = {
  mainnetFork: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  rsk: "0x542FDA317318eBf1d3DeAF76E0B632741a7e677d" // actually wrBTC, reversed to reflect rbtc native coin
};

export const wETH_precision: { [key: string]: number } = {
  mainnetFork: 18,
  rsk: 18 // actually wrBTC, reversed to reflect rbtc native coin
};

export const wBTC_address: { [key: string]: string } = {
  mainnetFork: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  rsk: "0x1D931Bf8656d795E50eF6D639562C5bD8Ac2B78f" // actually eths, reversed to reflect rbtc native coin
};

export const wBTC_precision: { [key: string]: number } = {
  mainnetFork: 8,
  rsk: 18 // actually eths, reversed to reflect rbtc native coin
};

export const EUR_USD_FEED_ADDRESS: { [key: string]: string } = {
  mainnetFork: "0xb49f677943BC038e9857d61E7d053CaA2C1734C1"
};

export const ETH_USD_FEED_ADDRESS: { [key: string]: string } = {
  mainnetFork: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"
};

// we only ue this feed in tests moce it out
export const BTC_USD_FEED_ADDRESS: { [key: string]: string } = {
  mainnetFork: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c"
};

export const BTC_ETH_FEED_ADDRESS: { [key: string]: string } = {
  mainnetFork: "0xdeb288F737066589598e9214E782fa5A8eD689e8"
};

export const NATIVE_TOKEN_NAME: { [key: string]: string } = {
  mainnetFork: "ETH",
  rsk: "RBTC"
};

export const numberOfLPs = 11;

export const initialBdstableMintingAmount = (networkName = "mainnetFork"): BigNumber => {
  switch (networkName) {
    case "rsk": {
      return to_d18(15e3);
    }
    case "mainnetFork": {
      return to_d18(30e3);
    }
    default: {
      return to_d18(15e3);
    }
  }
};

export const INITIAL_BDEU_UNISWAP_EUR_AMOUNT = 500;
export const INITIAL_BDUS_UNISWAP_USD_AMOUNT = 500;
export const INITIAL_BDX_UNISWAP_EUR_AMOUNT = 9000;
export const INITIAL_BDX_UNISWAP_USD_AMOUNT = 10000;
export const INITIAL_BDX_AMOUNT_FOR_BDSTABLE = to_d18(1e5);

// original uniswap addresss on ETH
export const ETH_uniswapRouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

export const RSK_RUSDT_ADDRESS = "0xEf213441a85DF4d7acBdAe0Cf78004E1e486BB96";
export const RSK_WRBTC_ADDRESS = "0x542FDA317318eBf1d3DeAF76E0B632741a7e677d";
export const RSK_ETHS_ADDRESS = "0x1D931BF8656D795e50Ef6d639562C5bD8AC2b78F";
export const RSK_XUSD_ADDRESS = "0xb5999795BE0eBb5BAb23144Aa5fD6a02d080299f";

export const RSK_SOVRYN_NETWORK = "0x98AcE08d2B759A265ae326f010496BCd63c15Afc";

export const rskBotAddress = "0x2A119532248d0E4Ff68A42bB37f64336C3F20872";
export const rskDevTreasuryAddress = "0x48e2B176dB179d81135052F4bee7fB1129f270DD";

export const bdxLockAmount = to_d18(3150000);
