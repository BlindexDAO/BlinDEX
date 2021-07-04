// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

interface ICryptoPairOracle {
    
    function consult(address tokenIn, uint256 amountIn)
        external
        view
        returns (uint amountOut);

    function updateOracle() external;

    function shouldUpdateOracle() external view returns (bool);
}
