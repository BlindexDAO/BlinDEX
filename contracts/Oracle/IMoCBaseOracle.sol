// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface IMoCBaseOracle {
  function peek() external view returns (bytes32, bool);
}
