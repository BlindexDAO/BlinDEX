// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;

interface IPriceFeed {
    function decimals() external view returns (uint8);
    function price() external view returns (uint256);
}