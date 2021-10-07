// SPDX-License-Identifier: GNU General Public License v3.0
pragma solidity 0.6.11;

interface IUniswapV2Callee {
    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external;
}
