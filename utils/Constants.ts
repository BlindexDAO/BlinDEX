import { to_d18 } from "./Helpers";

export const wETH_address = <any>{
    localhost: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    mainnetFork: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    rinkeby: '0xc778417e063141139fce010982780140aa0cd5ab',
    kovan: '0xd0a1e359811322d97991e03f863a0c30c2cf029c',
    rsk: '0x967f8799af07df1534d48a95a5c9febe92c53ae0', // actually wrBTC, reversed to reflect rbtc native coin
};
export const wBTC_address = <any>{
    localhost: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    mainnetFork: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    rinkeby: '0xc778417e063141139fce010982780140aa0cd5ab',
    kovan: '0xCf516441828895f47aA02C335b6c0d37F9B7c3C2',
    rsk: '0x1d931bf8656d795e50ef6d639562c5bd8ac2b78f', // actually eths, reversed to reflect rbtc native coin
};

export const EUR_USD_FEED_ADDRESS = <any>{
    localhost: "0xb49f677943BC038e9857d61E7d053CaA2C1734C1",
    mainnetFork: "0xb49f677943BC038e9857d61E7d053CaA2C1734C1",
    rinkeby: "0x78F9e60608bF48a1155b4B2A5e31F32318a1d85F",
    kovan: "0x0c15Ab9A0DB086e062194c273CC79f41597Bbf13",
    rsk: '', // we're using our pseudo-oracele at this point due to not official feed
};

export const ETH_USD_FEED_ADDRESS = <any>{
    localhost: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    mainnetFork: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    rinkeby: "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e",
    kovan: "0x9326BFA02ADD2366b30bacB125260Af641031331",
    rsk: '0x7B19bb8e6c5188eC483b784d6fB5d807a77b21bF', // actually btc/usd, reversed to reflect rbtc native coin
};

export const BTC_USD_FEED_ADDRESS = <any>{
    localhost: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    mainnetFork: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    rinkeby: "0xECe365B379E1dD183B20fc5f022230C044d51404",
    kovan: "0x6135b13325bfC4B00278B4abC5e20bbce2D6580e",
    rsk: '', // we only ue this feed in tests
};

export const BTC_ETH_FEED_ADDRESS = <any>{
    localhost: "0xdeb288F737066589598e9214E782fa5A8eD689e8",
    mainnetFork: "0xdeb288F737066589598e9214E782fa5A8eD689e8",
    rinkeby: "0x2431452A0010a43878bF198e170F6319Af6d27F4",
    kovan: "0xF7904a295A029a3aBDFFB6F12755974a958C7C25",
    rsk: '', // we only ue this feed in tests
};

export const uniswapRouterAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'

export const numberOfLPs = 11;

export const initalBdStableToOwner_d18 = <any>{
    localhost: to_d18(10000),
    mainnetFork: to_d18(10000),
    rinkeby: to_d18(10000),
    kovan: to_d18(10000),
    rsk: to_d18(10000),
};

//todo ag how much bdx?
export const initalBdStable_bdx_d18 = <any>{
    localhost: to_d18(10000),
    mainnetFork: to_d18(10000),
    rinkeby: to_d18(10000),
    kovan: to_d18(10000),
    rsk: to_d18(10000),
};