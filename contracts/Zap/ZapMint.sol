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

contract ZapMint is PausableUpgradeable, OwnableUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct ZapMintParameters {
        uint256 amountOutMin;
        address bdstableToMintAddress;
        address bdstablePoolAddress;
        address[] collateralSwapPath;
        address[] bdxSwapPath;
        uint256 amountIn;
        address router;
        uint256 deadline;
    }

    mapping(address => bool) private mapZapMintSupportedTokens;
    address[] public zapMintSupportedTokens;
    IERC20 private BDX;

    function initialize(address _bdxAddress) external initializer {
        __Ownable_init();
        __Pausable_init();
        BDX = IERC20(_bdxAddress);
    }

    function addTokenSupportForMinting(address token) public onlyOwner {
        if (!mapZapMintSupportedTokens[token]) {
            mapZapMintSupportedTokens[token] = true;
            zapMintSupportedTokens.push(token);

            emit AddTokenSupportForMinting(token);
        }
    }

    function removeTokenSupportFromMinting(uint256 index) external onlyOwner {
        address token = zapMintSupportedTokens[index];
        if (mapZapMintSupportedTokens[token]) {
            mapZapMintSupportedTokens[token] = false;
            zapMintSupportedTokens[index] = zapMintSupportedTokens[zapMintSupportedTokens.length - 1];
            zapMintSupportedTokens.pop();

            emit RemoveTokenSupportFromMinting(token);
        }
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
            require(mapZapMintSupportedTokens[parameters.collateralSwapPath[0]], "ZapMint: Collateral path token is not supported for zap minting");
            (bool success, uint256 swapResultAmount, string memory errors) = swap(
                parameters.collateralSwapPath,
                amountForCollateralSwap,
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
            require(mapZapMintSupportedTokens[parameters.bdxSwapPath[0]], "ZapMint: Bdx path token is not supported for zap minting");
            (bool success, uint256 swapResultAmount, string memory errors) = swap(
                parameters.bdxSwapPath,
                amountForBdxSwap,
                parameters.router,
                parameters.deadline
            );
            if (!success) {
                //swap collateral to input token back and return ?
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
            parameters.amountOutMin,
            parameters.bdstablePoolAddress
        );
        if (!success) {
            //swap bdx and colalteral back and return?
            revert(errors);
        }

        IERC20(parameters.bdstableToMintAddress).safeTransfer(payable(msg.sender), mintResultAmount);
    }

    function getCollateralAndBdxAmountsForSwap(uint256 amountIn, address bdstableToMintAddress) private returns (uint256, uint256) {
        BDStable stableToMint = BDStable(bdstableToMintAddress);
        uint256 collateralRatio_d12 = stableToMint.global_collateral_ratio_d12();
        uint256 amountForCollateralSwap = (amountIn * collateralRatio_d12) / 1e12;
        uint256 amountForBdxSwap = (amountIn * (uint256(1e12) - collateralRatio_d12)) / 1e12;
        return (amountForCollateralSwap, amountForBdxSwap);
    }

    function swap(
        address[] calldata path,
        uint256 amountIn,
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
        try IUniswapV2Router02(router).swapExactTokensForTokens(amountIn, 0, path, address(this), deadline) returns (uint256[] memory amountsOut) {
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
        BdStablePool(payable(bdstablePoolAddress)).mintFractionalBdStable(collateralSwapResultAmount, bdxSwapResultAmount, amountOutMin, false);

        try BdStablePool(payable(bdstablePoolAddress)).mintFractionalBdStable(collateralSwapResultAmount, bdxSwapResultAmount, amountOutMin, false) {
            return (true, IERC20(bdstableToMint).balanceOf(address(this)) - balanceBeforeMint, "");
        } catch Error(string memory reason) {
            return (false, 0, string.concat("ZapMint: ", reason));
        } catch (bytes memory lowLevelData) {
            return (false, 0, "");
        }
    }

    receive() external payable {}

    event AddTokenSupportForMinting(address indexed token);
    event RemoveTokenSupportFromMinting(address indexed token);
}
