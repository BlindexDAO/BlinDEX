// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./interfaces/ISovrynNetwork.sol";

contract AMMInvestorsHelper is OwnableUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum RouterTypes {
        UniswapV2,
        Sovryn
    }

    struct ToRoute {
        address[] path;
        address router;
        RouterTypes routerType;
    }

    struct FullRoute {
        address from;
        ToRoute to;
    }

    mapping(address => mapping(address => ToRoute[])) allRoutes;

    /* ========== INITIALIZER ========== */

    // TODO: Should it be memory of calldata???????
    function initialize(FullRoute[] calldata _fullRoutes) external initializer {
        __Ownable_init();

        require(owner() != address(0), "AMMInvestorsHelper: owner must be set");

        for (uint256 i = 0; i < _fullRoutes.length; ++i) {
            // TODO: Should be memory or call data??
            FullRoute memory currentRoute = _fullRoutes[i];
            address to = currentRoute.to.path[currentRoute.to.path.length - 1];

            // TODO: How do I check if this actually exists on the maping?? So I would initialize the array if needed??
            allRoutes[currentRoute.from][to].push(currentRoute.to);
        }
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    // TODO: How do I unregister paths????
    function registerRoute(FullRoute calldata route) external onlyOwner {
        require(route.from != address(0), "The 'from' token must be set");
        require(route.to.routerType >= type(RouterTypes).min && route.to.routerType <= type(RouterTypes).max, "Router type not supported");

        // TODO: This is how you write illigal????
        require(route.to.path.length >= 2, "Illigal path");
        require(route.to.router != address(0), "Router must be set");

        address to = route.to.path[route.to.path.length - 1];
        require(route.from != to, "The 'from' token must be different than the 'to' token");

        bool routeFound = false;

        // TODO: How do I check if this actually exists on the maping?? so I won't get null exception??
        for (uint256 i = 0; i < allRoutes[route.from][to].length; ++i) {
            // TODO: Should be memory or call data??
            ToRoute memory currentToRoute = allRoutes[route.from][to][i];

            if (currentToRoute.routerType == route.to.routerType && currentToRoute.path.length == route.to.path.length) {
                bool samePaths = true;

                for (uint256 pathIndex = 0; pathIndex < currentToRoute.path.length; ++pathIndex) {
                    if (currentToRoute.path[pathIndex] != route.to.path[pathIndex]) {
                        samePaths = false;
                        break;
                    }
                }

                if (samePaths) {
                    routeFound = true;
                    break;
                }
            }
        }

        if (!routeFound) {
            allRoutes[route.from][to].push(route.to);

            emit RouteRegistered(route.from, to, route.to.routerType);
        }
    }

    /* ========== External FUNCTIONS ========== */
    // TODO: Should be memory or call data
    function performBestSwapNew(
        address from,
        address to,
        uint256 amountIn,
        uint256 minAmountOut, // TODO: How do I take care of slippage
        uint256 deadline,
        bool transferBackToSender
    ) external nonReentrant returns (uint256) {
        (ToRoute memory bestRoute, uint256 bestRouteAmountOut) = _chooseBestRoute(from, to, amountIn);

        IERC20(from).transferFrom(msg.sender, address(this), amountIn);
        IERC20(from).approve(address(bestRoute.router), amountIn);

        uint256 finalSwapAmountOut;

        if (bestRoute.routerType == RouterTypes.UniswapV2) {
            // TODO: Call different functions based on the native token?????
            uint256[] memory swapAmounts = IUniswapV2Router02(bestRoute.router).swapExactTokensForTokens(
                amountIn,
                bestRouteAmountOut,
                bestRoute.path,
                address(this),
                deadline
            );

            finalSwapAmountOut = swapAmounts[swapAmounts.length - 1];
        } else if (bestRoute.routerType == RouterTypes.Sovryn) {
            ISovrynNetwork router = ISovrynNetwork(bestRoute.router);

            IERC20[] memory conversionPath = router.conversionPath(IERC20(from), IERC20(to));

            finalSwapAmountOut = router.convertByPath(conversionPath, amountIn, bestRouteAmountOut, address(this), address(0), 0);
        }

        // Make sure we got enough output tokens
        require(finalSwapAmountOut >= minAmountOut, "Minimum amount out of multi-swap is lower than the desired amount");

        if (transferBackToSender) {
            IERC20(to).transfer(msg.sender, finalSwapAmountOut);
        }

        return finalSwapAmountOut;
    }

    function _chooseBestRoute(
        address from,
        address to,
        uint256 amount
    ) private view returns (ToRoute memory, uint256) {
        ToRoute[] memory allPossibleRoutes = allRoutes[from][to];
        ToRoute memory bestToRoute;
        uint256 bestAmountOut = 0;

        for (uint256 i = 0; i < allPossibleRoutes.length; ++i) {
            ToRoute memory currentRoute = allPossibleRoutes[i];
            uint256 amountOut;

            if (currentRoute.routerType == RouterTypes.Sovryn) {
                ISovrynNetwork router = ISovrynNetwork(currentRoute.router);

                IERC20[] memory conversionPath = router.conversionPath(IERC20(from), IERC20(to));
                uint256 conversationRate = router.rateByPath(conversionPath, amount);

                amountOut = conversationRate * amount;
            } else if (currentRoute.routerType == RouterTypes.UniswapV2) {
                IUniswapV2Router02 router = IUniswapV2Router02(currentRoute.router);
                uint256[] memory amountsOut = router.getAmountsOut(amount, currentRoute.path);
                amountOut = amountsOut[amountsOut.length - 1];
            }

            if (amountOut > bestAmountOut) {
                bestAmountOut = amountOut;
                bestToRoute = currentRoute;
            }
        }

        return (bestToRoute, bestAmountOut);
    }

    function performBestSwap(
        address[] memory tokens, // =Number of swaps + 1
        uint256[] memory amounts, // =Number of swaps + 1
        address[] memory routers, // =Number of swaps
        RouterTypes[] memory routersTypes, // =Number of swaps
        uint256 deadline
    ) external nonReentrant {
        uint256 amountIn = amounts[0];

        IERC20(tokens[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 minOutput = amounts[amounts.length - 1];

        for (uint256 swapIndex = 0; swapIndex < routers.length; ++swapIndex) {
            require(
                routersTypes[swapIndex] >= type(RouterTypes).min && routersTypes[swapIndex] <= type(RouterTypes).max,
                "Router type not supported"
            );

            // TODO: Is this the right way of doing it??
            // if (tokens[swapIndex] != "NATIVE") {
            IERC20(tokens[swapIndex]).approve(address(routers[swapIndex]), amounts[swapIndex]);
            // }

            if (routersTypes[swapIndex] == RouterTypes.UniswapV2) {
                address[] memory path = new address[](2);
                path[0] = tokens[swapIndex];
                path[1] = tokens[swapIndex + 1];

                // TODO: Call different functions based on the native token
                uint256[] memory swapAmounts = IUniswapV2Router02(routers[swapIndex]).swapExactTokensForTokens(
                    amounts[swapIndex],
                    amounts[swapIndex + 1],
                    path,
                    address(this),
                    deadline
                );

                amounts[swapIndex + 1] = swapAmounts[swapAmounts.length - 1];
            } else if (routersTypes[swapIndex] == RouterTypes.Sovryn) {
                ISovrynNetwork router = ISovrynNetwork(routers[swapIndex]);

                IERC20[] memory conversionPath = router.conversionPath(IERC20(tokens[swapIndex]), IERC20(tokens[swapIndex + 1]));

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

    /* ========== EVENTS ========== */

    event RouteRegistered(address indexed from, address indexed to, RouterTypes indexed router);
}
