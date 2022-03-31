// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./IPriceFeed.sol";
import "./IOracleBasedCryptoFiatFeed.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
@dev A contract that will be used ONLY by BDUS as we're using USD as out base fiat currency
*/
contract OracleBasedWethUSDFeed is IOracleBasedCryptoFiatFeed {
    uint8 private constant DECIMALS = 12;

    IPriceFeed internal wethUsdFeed;
    using SafeMath for uint256;

    constructor(address _wethUsdFeedAddress) public {
        require(_wethUsdFeedAddress != address(0), "WethUsdFeed address cannot be 0");

        wethUsdFeed = IPriceFeed(_wethUsdFeedAddress);
    }

    function getPrice_1e12() public view override returns (uint256) {
        uint8 wethUsdDecimals = wethUsdFeed.decimals();

        if (wethUsdDecimals > 12) {
            uint256 excessiveDecimals = wethUsdDecimals - DECIMALS;
            return wethUsdFeed.price().div(10**(excessiveDecimals));
        } else {
            uint256 missingDecimals = DECIMALS - wethUsdDecimals;
            return wethUsdFeed.price().mul(10**(missingDecimals));
        }
    }

    function getDecimals() public view override returns (uint8) {
        return DECIMALS;
    }
}
