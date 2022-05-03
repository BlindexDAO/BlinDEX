export interface ERC20TokenData {
  address: string;
  symbol: string;
  decimals: number;
}

export interface ChainlinkPriceFeed {
  [key: string]: {
    address: string;
  } | null;
}

export interface ImportantComponents {
  [key: string]: {
    multisigTreasuryAddress?: string;
    botAddress?: string;
    sovrynNetwork?: string;
    uniswapRouterAddress?: string;
  };
}
