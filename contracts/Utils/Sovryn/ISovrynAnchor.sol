// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface ISovrynAnchor { 
    // returns address of corresponding LiquidityPoolV2Converter
    function owner() external view returns(address);
}
