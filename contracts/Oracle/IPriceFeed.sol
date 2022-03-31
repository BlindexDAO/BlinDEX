// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface IPriceFeed {
    function decimals() external view returns (uint8);

    function price() external view returns (uint256);
}
