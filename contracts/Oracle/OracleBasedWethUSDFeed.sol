// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "./IPriceFeed.sol";
import "./IOracleBasedCryptoFiatFeed.sol";

/**
@dev A contract that will be used ONLY by BDUS as we're using USD as out base fiat currency
*/
contract OracleBasedWethUSDFeed is IOracleBasedCryptoFiatFeed {
    uint8 private constant DECIMALS = 12;

    IPriceFeed internal wethUsdFeed;

    constructor(address _wethUsdFeedAddress) {
        require(_wethUsdFeedAddress != address(0), "WethUsdFeed address cannot be 0");

        wethUsdFeed = IPriceFeed(_wethUsdFeedAddress);
    }

    function getPrice_1e12() public view override returns (uint256) {
        uint8 wethUsdDecimals = wethUsdFeed.decimals();

        if (wethUsdDecimals > 12) {
            uint256 excessiveDecimals = wethUsdDecimals - DECIMALS;
            return wethUsdFeed.price() / (10**(excessiveDecimals));
        } else {
            uint256 missingDecimals = DECIMALS - wethUsdDecimals;
            return wethUsdFeed.price() * (10**(missingDecimals));
        }
    }

    function getDecimals() public pure override returns (uint8) {
        return DECIMALS;
    }
}
