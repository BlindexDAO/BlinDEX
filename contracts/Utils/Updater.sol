// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "../Oracle/SovrynSwapPriceFeed.sol";

contract Updater {

    function updateOraclesWithVerification(address[] memory _oracles, uint256[] memory _prices) public {
        for (uint i=0; i<_oracles.length; i++) {
            SovrynSwapPriceFeed(_oracles[i]).updateOracleWithVerification(_prices[i]);
        }
    }
}