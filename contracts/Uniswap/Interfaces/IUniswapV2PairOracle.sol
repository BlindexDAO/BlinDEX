// SPDX-License-Identifier: GNU General Public License v3.0
pragma solidity 0.6.11;

interface IUniswapV2PairOracle {
    
    function consult(address tokenIn, uint amountIn)
        external
        view
        returns (uint amountOut);
}
