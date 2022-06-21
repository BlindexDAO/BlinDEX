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
    uint256 private constant bdxCollateralAdjustment = 20000000000; //d12 2%

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
        console.log("before transferred funds");
        IERC20(parameters.collateralSwapPath[0]).safeTransferFrom(msg.sender, address(this), parameters.amountIn);
        console.log("transferred funds");
        (uint256 amountForCollateralSwap, uint256 amountForBdxSwap) = getCollateralAndBdxAmountsForSwap(
            parameters.amountIn,
            parameters.tokenInStablePrice,
            parameters.bdstableToMintAddress,
            parameters.bdstablePoolAddress
        );
        if (amountForBdxSwap > 0 && amountForCollateralSwap > 0) {
            require(
                parameters.collateralSwapPath[0] == parameters.bdxSwapPath[0],
                "ZapMint: Input token has to be the same for bdx and collateral token"
            );
        }
        uint256 collateralSwapResultAmount;
        uint256 bdxSwapResultAmount;
        console.log("Collateral");
        console.log("parameterscollateralSwapAmountOutMin: ", parameters.collateralSwapAmountOutMin);
        console.log("parametersbdxSwapAmountOutMin: ", parameters.bdxSwapAmountOutMin);
        console.log("amountForCollateralSwap: ", amountForCollateralSwap);
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
            console.log("collateral swap result: ", swapResultAmount);
            if (!success) {
                IERC20(parameters.collateralSwapPath[0]).safeTransfer(payable(msg.sender), parameters.amountIn);
                revert(errors);
            }
            collateralSwapResultAmount = swapResultAmount;
        }
        console.log("BDX");
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
            console.log("bdx swap result: ", swapResultAmount);
            if (!success) {
                //swap collateral to input token back and return ?
                IERC20(parameters.bdxSwapPath[0]).safeTransfer(payable(msg.sender), amountForBdxSwap);
                revert(errors);
            }
            bdxSwapResultAmount = swapResultAmount;
        }
        console.log("Mint");
        (bool success, uint256 mintResultAmount, string memory errors) = mint(
            parameters.collateralSwapPath[parameters.collateralSwapPath.length - 1],
            parameters.bdstableToMintAddress,
            collateralSwapResultAmount,
            bdxSwapResultAmount,
            parameters.mintAmountOutMin,
            parameters.bdstablePoolAddress
        );
        if (!success) {
            //swap bdx and colalteral back and return?
            revert(errors);
        }
        console.log("Transfer");
        console.log("mintResultAmount: ", mintResultAmount);
        console.log("bdstableToMintAddress: ", parameters.bdstableToMintAddress);
        IERC20(parameters.bdstableToMintAddress).safeTransfer(payable(msg.sender), mintResultAmount);
    }

    function getCollateralAndBdxAmountsForSwap(
        uint256 amountIn,
        uint256 tokenPrice,
        address bdstableToMintAddress,
        address bdstablePoolAddress
    ) private returns (uint256, uint256) {
        BDStable stableToMint = BDStable(bdstableToMintAddress);
        // uint256 bdxPrice = stableToMint.BDX_price_d12();
        // uint256 collateralPrice = BdStablePool(payable(bdstablePoolAddress)).getCollateralPrice_d12();
        uint256 collateralRatio = stableToMint.global_collateral_ratio_d12();
        uint256 tokenValue = amountIn * tokenPrice;
        uint256 collateralValue = (tokenValue * collateralRatio) / 1e24;
        // uint256 collateralNeeded = collateralValue * 1e12 / collateralPrice;
        uint256 bdxValue = (tokenValue / 1e12) - collateralValue;
        // uint256 bdxValue = ((amountIn * tokenPrice * (1e12 - collateralRatio)) / 1e24);
        // uint256 bdxNeeded = bdxValue * 1e12 / bdxPrice;

        console.log("amountIn: ", amountIn);
        console.log("collateralRatio: ", collateralRatio);
        // console.log("collateralPrice: ", collateralPrice);
        console.log("tokenPrice: ", tokenPrice);
        console.log("collateralValue: ", collateralValue);
        // console.log("collateralNeeded: ", collateralNeeded);
        console.log("bdxValue: ", bdxValue);
        // console.log("bdxNeeded: ", bdxNeeded);
        uint256 bdxPart = bdxValue + ((tokenValue / 1e12) - collateralValue - bdxValue);
        // uint256 collateralPart = collateralValue + (((tokenValue / 1e12) - collateralValue - bdxValue) * ((collateralValue * 1e12) / tokenValue)) / 1e12;
        console.log("colalteralpart: ", amountIn - bdxPart);
        console.log("bdxpart: ", bdxPart);
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
        console.log("xd1");
        uint256 balanceBeforeMint = IERC20(bdstableToMint).balanceOf(address(this));
        console.log("xd2");
        console.log("balance before: ", IERC20(tokenToUseForMint).balanceOf(address(this)));
        console.log("approv coll before: ", collateralSwapResultAmount);
        IERC20(tokenToUseForMint).approve(bdstablePoolAddress, collateralSwapResultAmount);
        console.log("xd3");
        console.log("balance before: ", BDX.balanceOf(address(this)));
        console.log("approv bdx before: ", bdxSwapResultAmount);
        BDX.approve(bdstablePoolAddress, bdxSwapResultAmount);
        console.log("xd4");
        console.log("amountoutMin: ", amountOutMin);
        try BdStablePool(payable(bdstablePoolAddress)).mintFractionalBdStable(collateralSwapResultAmount, bdxSwapResultAmount, amountOutMin, false) {
            console.log("xd6");
            return (true, IERC20(bdstableToMint).balanceOf(address(this)) - balanceBeforeMint, "");
        } catch Error(string memory reason) {
            console.log("xd7");
            return (false, 0, string.concat("ZapMint: ", reason));
        } catch (bytes memory lowLevelData) {
            console.log("xd8");
            return (false, 0, "");
        }
    }

    receive() external payable {}

    event TokenSupportAdded(address indexed token);
    event TokenSupportRemoved(address indexed token);
}
