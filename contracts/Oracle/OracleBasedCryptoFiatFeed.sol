// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "./IPriceFeed.sol";
import "./IOracleBasedCryptoFiatFeed.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract OracleBasedCryptoFiatFeed is IOracleBasedCryptoFiatFeed {
    using SafeMath for uint256;

    IPriceFeed internal fiatToUsdFeed;
    IPriceFeed internal cryptoToUsdFeed;

    constructor(address _fiatToUsdFeedAddress, address _cryptoUsdFeedAddress) {
        require(_fiatToUsdFeedAddress != address(0), "FiatToUsdFeed address cannot be 0");
        require(_cryptoUsdFeedAddress != address(0), "CryptoUsdFeed address cannot be 0");

        fiatToUsdFeed = IPriceFeed(_fiatToUsdFeedAddress);
        cryptoToUsdFeed = IPriceFeed(_cryptoUsdFeedAddress);
    }

    function getPrice_1e12() public view override returns (uint256) {
        uint256 fiatUsdPrice = fiatToUsdFeed.price();
        uint256 cryptoUsdPrice = cryptoToUsdFeed.price();

        return
            uint256(1e12).mul(cryptoUsdPrice).mul(uint256(10)**fiatToUsdFeed.decimals()).div(fiatUsdPrice).div(
                uint256(10)**cryptoToUsdFeed.decimals()
            );
    }

    function getDecimals() public pure override returns (uint8) {
        return 12;
    }
}
