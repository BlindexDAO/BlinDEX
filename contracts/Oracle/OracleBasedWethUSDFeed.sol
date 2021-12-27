// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./IPriceFeed.sol";
import "./IOracleBasedCryptoFiatFeed.sol";

/**
@dev A contract that will be used ONLY by BDUS as we're using USD as out base fiat currency
*/
contract OracleBasedWethUSDFeed is IOracleBasedCryptoFiatFeed {
    IPriceFeed internal wethUsdFeedAddress;

    constructor(address _wethUsdFeedAddress) public {
        require(_wethUsdFeedAddress != address(0), "WethUsdFeed address cannot be 0");

        wethUsdFeedAddress = IPriceFeed(_wethUsdFeedAddress);
    }

    function getPrice_1e12() public view override returns (uint256) {
        return wethUsdFeedAddress.price();
    }

    function getDecimals() public view override returns (uint8) {
        return 12;
    }
}
