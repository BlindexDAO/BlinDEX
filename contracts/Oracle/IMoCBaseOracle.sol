// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;

import "./AggregatorV3Interface.sol";

interface IMoCBaseOracle {
  function peek() external view returns (bytes32, bool);
}
