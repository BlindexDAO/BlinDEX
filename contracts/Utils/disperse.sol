// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Disperse {
    function disperseEther(address[] memory recipients, uint256[] memory values) external payable {
        require(recipients.length > 0, "at least one recipient is required");
        require(recipients.length == values.length, "recipients length must be equal to values");

        for (uint256 i = 0; i < recipients.length; i++) payable(recipients[i]).transfer(values[i]);

        uint256 balance = address(this).balance;

        if (balance > 0) payable(msg.sender).transfer(balance);
    }

    function disperseToken(
        address erc20Address,
        address[] memory recipients,
        uint256[] memory values
    ) external {
        require(recipients.length > 0, "at least one recipient is required");
        require(recipients.length == values.length, "recipients length must be equal to values");

        uint256 total = 0;
        uint256 i;
        IERC20 token = IERC20(erc20Address);

        for (i = 0; i < recipients.length; i++) total += values[i];

        require(token.transferFrom(msg.sender, address(this), total));

        for (i = 0; i < recipients.length; i++) require(token.transfer(recipients[i], values[i]));
    }
}
