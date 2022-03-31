// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface IOracleBasedCryptoFiatFeed {
    function getPrice_1e12() external view returns (uint256);

    function getDecimals() external view returns (uint8);
}
