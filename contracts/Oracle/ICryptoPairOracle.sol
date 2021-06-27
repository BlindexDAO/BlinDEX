// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

interface ICryptoPairOracle {
    
    function consult(address tokenIn, uint amountIn)
        external
        view
        returns (uint amountOut);
}
