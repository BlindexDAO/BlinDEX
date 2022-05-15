// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "./IPriceFeed.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract AggregatorV3PriceFeed is IPriceFeed {
    AggregatorV3Interface private feed;

    constructor(address _feedAddress) {
        require(_feedAddress != address(0), "Feed address cannot be 0");

        feed = AggregatorV3Interface(_feedAddress);
    }

    function decimals() external view override returns (uint8) {
        return feed.decimals();
    }

    function price() external view override returns (uint256) {
        (, int256 priceVal, , , ) = feed.latestRoundData();
        return uint256(priceVal);
    }
}
