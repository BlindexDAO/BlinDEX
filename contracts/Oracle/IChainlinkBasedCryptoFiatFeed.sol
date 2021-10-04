// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

import "./AggregatorV3Interface.sol";
import "../Math/SafeMath.sol";
import "hardhat/console.sol";

interface IChainlinkBasedCryptoFiatFeed {
    
    function getPrice_1e12() external view returns (uint256);
    function getDecimals() external view returns (uint8);
}