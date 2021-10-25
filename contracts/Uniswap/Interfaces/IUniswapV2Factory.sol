// SPDX-License-Identifier: GNU General Public License v3.0
// Based on https://github.com/Uniswap/v2-core

pragma solidity 0.6.11;

interface IUniswapV2Factory {
    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    function feeTo() external view returns (address);
    function treasury() external view returns (address);
    function maxSpotVsOraclePriceDivergence_d12() external view returns (uint256);

    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);

    function createPair(address tokenA, address tokenB) external returns (address pair);

    function setFeeTo(address) external;
    function setTreasury(address) external;
    function setMaxSpotVsOraclePriceDivergence_d12(uint256) external;
}
