// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

interface ISovrynLiquidityPoolV2Converter { 
    // returns address of corresponding LiquidityPoolV2Converter
    function effectiveTokensRate() external view returns(uint256 numerator, uint256 denominator);
}
