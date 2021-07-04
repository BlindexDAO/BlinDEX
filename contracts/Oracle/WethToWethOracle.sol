// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

import '../Uniswap/Interfaces/IUniswapV2Factory.sol';
import '../Uniswap/Interfaces/IUniswapV2Pair.sol';
import '../Math/FixedPoint.sol';

import '../Uniswap/UniswapV2OracleLibrary.sol';
import '../Uniswap/UniswapV2Library.sol';
import "./ICryptoPairOracle.sol";

import "hardhat/console.sol";

// Fixed window oracle that recomputes the average price for the entire period once every period
// Note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract WethToWethOracle is ICryptoPairOracle {
    
    // Note this will always return 0 before update has been called successfully for the first time.
    function consult(address token, uint256 amountIn) override view external returns (uint amountOut) {
        //require(token == WETH) todo ag
        return amountIn;
    }

    function updateOracle() public override {}

    function shouldUpdateOracle() public view override returns (bool) {
        return false;
    }
}