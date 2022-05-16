export interface PriceFeed {
  address: string;
  decimals: number;
  updatable: boolean;
}

export interface PriceFeedConfig {
  [key: string]: PriceFeed;
}
