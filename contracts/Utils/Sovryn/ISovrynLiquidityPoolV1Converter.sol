// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface ISovrynLiquidityPoolV1Converter {
    function targetAmountAndFee(
        address _sourceToken,
        address _targetToken,
        uint256 _amount
    ) external view returns (uint256 amountMinusFee, uint256 fee);
}
