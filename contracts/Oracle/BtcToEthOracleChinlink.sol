// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./ICryptoPairOracle.sol";

contract BtcToEthOracleChinlink is ICryptoPairOracle {
    AggregatorV3Interface internal feed;
    address internal wethAddress;

    constructor(address _btcEthFeedAddress, address _wethAddress) {
        require(_btcEthFeedAddress != address(0), "BtcEthFeed address cannot be 0");
        require(_wethAddress != address(0), "Weth address cannot be 0");

        feed = AggregatorV3Interface(_btcEthFeedAddress);
        wethAddress = _wethAddress;
    }

    function getPrice_1e12() public view returns (uint256) {
        uint256 price = getLatestPrice(feed);

        return (uint256(1e12) * price) / (uint256(10)**feed.decimals());
    }

    function consult(address tokenIn, uint256 amountIn) external view override returns (uint256) {
        require(tokenIn == wethAddress, "This oracle only accepts consulting WETH input");

        return (amountIn * 1e12) / getPrice_1e12();
    }

    function getLatestPrice(AggregatorV3Interface _feed) internal view returns (uint256) {
        (, int256 price, , , ) = _feed.latestRoundData();
        return uint256(price);
    }

    function updateOracle() external pure override {
        revert("This oracle doesn't need updates");
    }

    function shouldUpdateOracle() external pure override returns (bool) {
        return false;
    }

    function decimals() external view override returns (uint8) {
        return feed.decimals();
    }
}
