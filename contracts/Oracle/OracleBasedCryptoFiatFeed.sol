// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

import "./IPriceFeed.sol";
import "./IOracleBasedCryptoFiatFeed.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract OracleBasedCryptoFiatFeed is IOracleBasedCryptoFiatFeed {
    using SafeMath for uint256;

    IPriceFeed internal fiatToUsdFeed;
    IPriceFeed internal cryptoToUsdFeed;
    
    constructor(address _fiatToUsdFeedAddress, address _cryptUsdFeedAddress) public {
        fiatToUsdFeed = IPriceFeed(_fiatToUsdFeedAddress);
        cryptoToUsdFeed = IPriceFeed(_cryptUsdFeedAddress);
    }

    function getPrice_1e12() override public view returns (uint256) {
        uint256 fiatUsdPrice = fiatToUsdFeed.price();
        uint256 cryptoUsdPrice = cryptoToUsdFeed.price();

        return uint256(1e12)
            .mul(cryptoUsdPrice)
            .mul(uint256(10)**fiatToUsdFeed.decimals())
            .div(fiatUsdPrice)
            .div(uint256(10)**cryptoToUsdFeed.decimals());
    }
    
    function getDecimals() override public view returns (uint8) {
        return 12 + fiatToUsdFeed.decimals() - cryptoToUsdFeed.decimals();
    }
}