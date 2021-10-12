// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPriceFeed.sol";
import "./IMoCBaseOracle.sol";

//todo ag test against real RSK network
contract MoneyOnChainPriceFeed is IPriceFeed, Ownable {
    IMoCBaseOracle private feed;

    uint8 precision = 18;

    constructor(address _feedAddress) public {
        feed = IMoCBaseOracle(_feedAddress);
    }

    function decimals() external view override returns (uint8) {
        return precision;
    }

    function price() external view override returns (uint256) {
        (bytes32 priceVal, bool isValid) = feed.peek();

        require(isValid, "Invalid price feed");

        return uint256(priceVal);
    }

    function setPrecision(uint8 _precision) public onlyOwner {
        precision = _precision;
    }
}