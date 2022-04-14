// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISovrynSwapNetwork {
    /**
    @return The swap outAmount
    */
    function convertByPath(
        IERC20[] calldata _path,
        uint256 _amount,
        uint256 _minReturn,
        address _beneficiary,
        address _affiliateAccount,
        uint256 _affiliateFee
    ) external payable returns (uint256);

    /**
    @return The swap rate
     */
    function rateByPath(IERC20[] calldata _path, uint256 _amount) external view returns (uint256);

    /**
    token0 - anchor - token1 - anchor - token2
    @return the best path of ERC20 token address for the swap
     */
    function conversionPath(IERC20 from, IERC20 to) external view returns (IERC20[] memory);
}
