// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./interfaces/ISovrynSwapNetwork.sol";

contract AMMInvestorsHelper is OwnableUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum RouterTypes {
        UniswapV2,
        Sovryn
    }

    /* ========== INITIALIZER ========== */

    function initialize() external initializer {
        __Ownable_init();

        require(owner() != address(0), "AMMInvestorsHelper: owner must be set");
    }

    /* ========== External FUNCTIONS ========== */

    function performBestSwap(
        address[] memory paths, // =Number of swaps + 1
        uint256[] memory amounts, // =Number of swaps + 1
        address[] memory routers, // =Number of swaps
        RouterTypes[] memory routersTypes, // =Number of swaps
        uint256 deadline
    ) external nonReentrant {
        uint256 amountIn = amounts[0];

        IERC20(paths[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 minOutput = amounts[amounts.length - 1];

        for (uint256 swapIndex = 0; swapIndex < routers.length; ++swapIndex) {
            require(
                routersTypes[swapIndex] >= type(RouterTypes).min && routersTypes[swapIndex] <= type(RouterTypes).max,
                "Router type not supported"
            );

            IERC20(paths[swapIndex]).approve(address(routers[swapIndex]), amounts[swapIndex]);

            if (routersTypes[swapIndex] == RouterTypes.UniswapV2) {
                address[] memory path = new address[](2);
                path[0] = paths[swapIndex];
                path[1] = paths[swapIndex + 1];

                // TODO: Call different functions if the swaps are using the native tokens??
                uint256[] memory swapAmounts = IUniswapV2Router02(routers[swapIndex]).swapExactTokensForTokens(
                    amounts[swapIndex],
                    amounts[swapIndex + 1],
                    path,
                    address(this),
                    deadline
                );

                amounts[swapIndex + 1] = swapAmounts[swapAmounts.length - 1];
            } else if (routersTypes[swapIndex] == RouterTypes.Sovryn) {
                ISovrynSwapNetwork router = ISovrynSwapNetwork(routers[swapIndex]);

                IERC20[] memory conversionPath = router.conversionPath(IERC20(paths[swapIndex]), IERC20(paths[swapIndex + 1]));

                amounts[swapIndex + 1] = router.convertByPath(
                    conversionPath,
                    amounts[swapIndex],
                    amounts[swapIndex + 1],
                    address(this),
                    address(0),
                    0
                );
            }
        }

        // Make sure we got enough output tokens
        require(amounts[amounts.length - 1] >= minOutput, "Minimum amount out of multi-swap is lower than the desired amount");
    }
}
