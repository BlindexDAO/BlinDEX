// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./AggregatorV3Interface.sol";
import "./ICryptoPairOracle.sol";

contract BtcToEthOracleChinlink is ICryptoPairOracle {
    using SafeMath for uint256;

    AggregatorV3Interface internal feed;
    address internal wethAddress;
    
    constructor(address _btcEthFeedAddress, address _wethAddress) public {
        require(_btcEthFeedAddress != address(0), "BtcEthFeed address cannot be 0");
        require(_wethAddress != address(0), "Weth address cannot be 0");

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

    function getLatestPrice(AggregatorV3Interface _feed) internal view returns (uint256) {
        (
            , 
            int256 price,
            ,
            ,
            
        ) = _feed.latestRoundData();
        return uint256(price);
    }

    function updateOracle() external override {
        revert("This oracle doesn't need updates");
    }

    function shouldUpdateOracle() external view override returns (bool) {
        return false;
    }
}