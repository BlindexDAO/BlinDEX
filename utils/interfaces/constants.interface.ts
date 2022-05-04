export interface ChainlinkPriceFeed {
  [key: string]: {
    address: string;
  };
}

export interface ChainSpecificComponents {
  [key: string]: {
    teamLockingContract?: string;
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
