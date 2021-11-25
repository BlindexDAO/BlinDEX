// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface ISovrynSwapNetwork {
    //token0 - anchor - token1 - anchor - token2 
    function conversionPath(address from, address to) external view returns (address[] memory);
}