// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

import "./AggregatorV3Interface.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface IChainlinkBasedCryptoFiatFeed {
    
    function getPrice_1e12() external view returns (uint256);
    function getDecimals() external view returns (uint8);
}