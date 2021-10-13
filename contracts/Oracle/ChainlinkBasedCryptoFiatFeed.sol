// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

import "./AggregatorV3Interface.sol";
import "./IChainlinkBasedCryptoFiatFeed.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract ChainlinkBasedCryptoFiatFeed is IChainlinkBasedCryptoFiatFeed {
    using SafeMath for uint256;

    AggregatorV3Interface internal fiatToUsdFeed;
    AggregatorV3Interface internal cryptoToUsdFeed;
    
    constructor(address _fiatToUsdFeedAddress, address _cryptUsdFeedAddress) public {
        fiatToUsdFeed = AggregatorV3Interface(_fiatToUsdFeedAddress);
        cryptoToUsdFeed = AggregatorV3Interface(_cryptUsdFeedAddress);
    }

    function getPrice_1e12() override public view returns (uint256) {
        uint256 fiatUsdPrice = getLatestPrice(fiatToUsdFeed);
        uint256 cryptoUsdPrice = getLatestPrice(cryptoToUsdFeed);

        return uint256(1e12)
            .mul(cryptoUsdPrice)
            .mul(uint256(10)**fiatToUsdFeed.decimals())
            .div(fiatUsdPrice)
            .div(uint256(10)**cryptoToUsdFeed.decimals());
    }

    function consult(address tokenIn, uint amountIn) external view returns (uint256) {     
        require(tokenIn == address(cryptoToUsdFeed), "This oracle only accepts consulting crypto input");

        return getPrice_1e12().mul(amountIn).div(1e12);
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
    
    function getDecimals() override public view returns (uint8) {
        return 12 + fiatToUsdFeed.decimals() - cryptoToUsdFeed.decimals();
    }
}