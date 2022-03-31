// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "./ICryptoPairOracle.sol";

// Fixed window oracle that recomputes the average price for the entire period once every period
// Note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract WethToWethOracle is ICryptoPairOracle {
    address internal wethAddress;

    uint8 private constant DECIMALS = 18;

    constructor(address _wethAddress) public {
        require(_wethAddress != address(0), "Weth address cannot be 0");

        wethAddress = _wethAddress;
    }

    function consult(address tokenIn, uint256 amountIn) external view override returns (uint256 amountOut) {
        require(tokenIn == wethAddress, "This oracle only accepts consulting WETH input");

        return amountIn;
    }

    function updateOracle() external override {
        revert("This oracle doesn't need updates");
    }

    function shouldUpdateOracle() external view override returns (bool) {
        return false;
    }

    function decimals() external view override returns (uint8) {
        return DECIMALS;
    }
}
