// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

interface ISovrynAnchor {
    // returns address of corresponding LiquidityPoolV2Converter
    function owner() external view returns (address);
}
