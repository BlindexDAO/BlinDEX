// SPDX-License-Identifier: private
pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISovrynNetwork {
    /**
    @return The outAmount of the swap
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
    @return the rate of the swap
     */
    function rateByPath(IERC20[] calldata _path, uint256 _amount) external view returns (uint256);

    /**
    @return the best path of ERC20 token address for the swap
     */
    function conversionPath(IERC20 _sourceToken, IERC20 _targetToken) external view returns (IERC20[] memory);
}
