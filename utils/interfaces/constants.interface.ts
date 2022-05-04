export interface ChainlinkPriceFeed {
  [key: string]: {
    address: string;
  } | null;
}

export interface ChainSpecificComponents {
  [key: string]: {
    sovrynNetwork?: string;
    uniswapRouterAddress?: string;
  };
}

export interface MultichainAddresses {
  [key: string]: string;
}

export interface SupportedERC20Token {
  [key: string]: { symbol: string; address: string; decimals: number };
}
