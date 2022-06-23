// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../BdStable/Pools/BdStablePool.sol";
import "../BdStable/BDStable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/* 
!!! This contract is still Work-in-Progress and SHOULDN'T BE USED IN PRODUCTION SCENARIOS !!!

TODO list:
 * Test zap mint for 0% collateral ratio
 * Optimise gas usage
 * Provide multi-AMM functionality (each swap can be atomic and executed on different AMM)
 * use one initialized zapmint object for all tests (alternatively - move initialization to private method - partially done)
 * move common variables to constants (like deadline, router)
 * in case bdx swap fails:
      ** swap collateral token back to input token
      ** return input token to user
 * in case mint fails:
      ** swap collateral token back to input token
      ** swap bdx token back to input token
      ** return input token to user
 * implement functionality to zap mint based on 'required amount out' (more below)
 * add tests for all new require statements
 * add test for reentrancy 
 * fix all compilation warnings (npm run compile)
 */

contract ZapMint is PausableUpgradeable, OwnableUpgradeable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    struct ZapMintParameters {
        uint256 mintAmountOutMin;
        uint256 collateralSwapAmountOutMin;
        uint256 bdxSwapAmountOutMin;
        address bdstableToMintAddress;
        address bdstablePoolAddress;
        address[] collateralSwapPath;
        address[] bdxSwapPath;
        uint256 amountIn;
        uint256 tokenInStablePrice;
        address router;
        uint256 deadline;
    }

    EnumerableSet.AddressSet private supportedTokens;
    IERC20 private BDX;

    function initialize(address _bdxAddress) external initializer {
        __Ownable_init();
        __Pausable_init();
        BDX = IERC20(_bdxAddress);
    }

    function addTokenSupport(address _token) public onlyOwner {
        require(!supportedTokens.contains(_token), "ZapMint: Supported token already exists");
        require(_token != address(0), "ZapMint: Supported token cannot be 0 address");

        supportedTokens.add(_token);
        emit TokenSupportAdded(_token);
    }

    function removeTokenSupport(address _token) public onlyOwner {
        require(supportedTokens.contains(_token), "ZapMint: Token is already not supported");

        supportedTokens.remove(_token);
        emit TokenSupportRemoved(_token);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function zapMint(ZapMintParameters calldata parameters) external payable whenNotPaused nonReentrant {
        require(parameters.amountIn > 0, "ZapMint: Input amount has to be greater than zero");
        require(parameters.bdstableToMintAddress != address(0), "ZapMint: Bdstable to mint address cannot be zero");
        require(parameters.bdstablePoolAddress != address(0), "ZapMint: Bdstable pool address cannot be zero");
        require(parameters.router != address(0), "ZapMint: Router address cannot be zero");
        require(parameters.deadline > 0, "ZapMint: Deadline has bo te larger than zero");
        require(
            parameters.collateralSwapPath[parameters.collateralSwapPath.length - 1] ==
                address(BdStablePool(payable(parameters.bdstablePoolAddress)).collateral_token()),
            "ZapMint: Last address of path has to be equal to bdstable pool collateral address"
        );
        IERC20(parameters.collateralSwapPath[0]).safeTransferFrom(msg.sender, address(this), parameters.amountIn);
        (uint256 amountForCollateralSwap, uint256 amountForBdxSwap) = getCollateralAndBdxAmountsForSwap(
            parameters.amountIn,
            parameters.tokenInStablePrice,
            parameters.bdstableToMintAddress
        );
        if (amountForBdxSwap > 0 && amountForCollateralSwap > 0) {
            require(
                parameters.collateralSwapPath[0] == parameters.bdxSwapPath[0],
                "ZapMint: Input token has to be the same for bdx and collateral token"
            );
        }
        uint256 collateralSwapResultAmount;
        uint256 bdxSwapResultAmount;
        if (amountForCollateralSwap > 0) {
            require(parameters.collateralSwapPath.length > 1, "ZapMint: Collateral path has to be longer than one");
            require(supportedTokens.contains(parameters.collateralSwapPath[0]), "ZapMint: Collateral path token is not supported for zap minting");
            (bool success, uint256 swapResultAmount, string memory errors) = swap(
                parameters.collateralSwapPath,
                amountForCollateralSwap,
                parameters.collateralSwapAmountOutMin,
                parameters.router,
                parameters.deadline
            );
            if (!success) {
                IERC20(parameters.collateralSwapPath[0]).safeTransfer(payable(msg.sender), parameters.amountIn);
                revert(errors);
            }
            collateralSwapResultAmount = swapResultAmount;
        }
        if (amountForBdxSwap > 0) {
            require(parameters.bdxSwapPath.length > 1, "ZapMint: Bdx path has to be longer than one");
            require(supportedTokens.contains(parameters.bdxSwapPath[0]), "ZapMint: Bdx path token is not supported for zap minting");
            (bool success, uint256 swapResultAmount, string memory errors) = swap(
                parameters.bdxSwapPath,
                amountForBdxSwap,
                parameters.bdxSwapAmountOutMin,
                parameters.router,
                parameters.deadline
            );
            if (!success) {
                IERC20(parameters.bdxSwapPath[0]).safeTransfer(payable(msg.sender), amountForBdxSwap);
                revert(errors);
            }
            bdxSwapResultAmount = swapResultAmount;
        }
        (bool success, uint256 mintResultAmount, string memory errors) = mint(
            parameters.collateralSwapPath[parameters.collateralSwapPath.length - 1],
            parameters.bdstableToMintAddress,
            collateralSwapResultAmount,
            bdxSwapResultAmount,
            parameters.mintAmountOutMin,
            parameters.bdstablePoolAddress
        );
        if (!success) {
            revert(errors);
        }
        IERC20(parameters.bdstableToMintAddress).safeTransfer(payable(msg.sender), mintResultAmount);
    }

    function getCollateralAndBdxAmountsForSwap(
        uint256 amountIn,
        uint256 tokenPrice,
        address bdstableToMintAddress
    ) private returns (uint256, uint256) {
        BDStable stableToMint = BDStable(bdstableToMintAddress);
        uint256 collateralRatio = stableToMint.global_collateral_ratio_d12();
        uint256 tokenValue = amountIn * tokenPrice;
        uint256 collateralValue = (tokenValue * collateralRatio) / 1e24;
        uint256 bdxValue = (tokenValue / 1e12) - collateralValue;
        uint256 bdxPart = bdxValue + ((tokenValue / 1e12) - collateralValue - bdxValue);
        return (amountIn - bdxPart, bdxPart);
    }

    function swap(
        address[] calldata path,
        uint256 amountIn,
        uint256 minAmountOut,
        address router,
        uint256 deadline
    )
        private
        returns (
            bool,
            uint256,
            string memory
        )
    {
        IERC20(path[0]).approve(router, amountIn);
        try IUniswapV2Router02(router).swapExactTokensForTokens(amountIn, minAmountOut, path, address(this), deadline) returns (
            uint256[] memory amountsOut
        ) {
            return (true, amountsOut[amountsOut.length - 1], "");
        } catch Error(string memory reason) {
            return (false, 0, string.concat("ZapMint: ", reason));
        } catch (bytes memory lowLevelData) {
            return (false, 0, "");
        }
    }

    function mint(
        address tokenToUseForMint,
        address bdstableToMint,
        uint256 collateralSwapResultAmount,
        uint256 bdxSwapResultAmount,
        uint256 amountOutMin,
        address bdstablePoolAddress
    )
        private
        returns (
            bool,
            uint256,
            string memory
        )
    {
        uint256 balanceBeforeMint = IERC20(bdstableToMint).balanceOf(address(this));
        IERC20(tokenToUseForMint).approve(bdstablePoolAddress, collateralSwapResultAmount);
        BDX.approve(bdstablePoolAddress, bdxSwapResultAmount);
        try BdStablePool(payable(bdstablePoolAddress)).mintFractionalBdStable(collateralSwapResultAmount, bdxSwapResultAmount, amountOutMin, false) {
            return (true, IERC20(bdstableToMint).balanceOf(address(this)) - balanceBeforeMint, "");
        } catch Error(string memory reason) {
            return (false, 0, string.concat("ZapMint: ", reason));
        } catch (bytes memory lowLevelData) {
            return (false, 0, "");
        }
    }

    event TokenSupportAdded(address indexed token);
    event TokenSupportRemoved(address indexed token);
}
