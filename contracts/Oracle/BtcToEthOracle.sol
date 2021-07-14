// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

import "../Math/SafeMath.sol";
import "./AggregatorV3Interface.sol";
import "./ICryptoPairOracle.sol";

import "hardhat/console.sol";

// Fixed window oracle that recomputes the average price for the entire period once every period
// Note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract BtcToEthOracle is ICryptoPairOracle {
    using SafeMath for uint256;

    AggregatorV3Interface internal feed;
    address internal wethAddress;
    
    constructor(address _btcEthFeedAddress, address _wethAddress) public {
        feed = AggregatorV3Interface(_btcEthFeedAddress);
        wethAddress = _wethAddress;
    }

    function getPrice_1e12() public view returns (uint256) {       
        uint256 price = getLatestPrice(feed);

        return uint256(1e12)
            .mul(price)
            .div(uint256(10)**feed.decimals());
    }

    function consult(address tokenIn, uint256 amountIn) external view override returns (uint256) {     
        require(tokenIn == wethAddress, "This oracle only accepts consulting WETH input");

        return amountIn.mul(1e12).div(getPrice_1e12());
    }

    function getLatestPrice(AggregatorV3Interface feed) internal view returns (uint256) {
        (
            , 
            int256 price,
            ,
            ,
            
        ) = feed.latestRoundData();
        return uint256(price);
    }

    function updateOracle() public override {}

    function shouldUpdateOracle() public view override returns (bool) {
        return false;
    }
}