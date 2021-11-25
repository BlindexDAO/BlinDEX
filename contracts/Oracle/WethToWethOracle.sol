// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

import "./ICryptoPairOracle.sol";

// Fixed window oracle that recomputes the average price for the entire period once every period
// Note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract WethToWethOracle is ICryptoPairOracle {
    
    address internal wethAddress;

    constructor(address _wethAddress) public {
        wethAddress = _wethAddress;
    }

    function consult(address tokenIn, uint256 amountIn) external view override returns (uint amountOut) {
        require(tokenIn == wethAddress, "This oracle only accepts consulting WETH input");

        return amountIn;
    }

    function updateOracle() public override {}

    function shouldUpdateOracle() public view override returns (bool) {
        return false;
    }

    function when_should_update_oracle_in_seconds() public view override returns (uint256) {
        return type(uint256).max;
    }
}