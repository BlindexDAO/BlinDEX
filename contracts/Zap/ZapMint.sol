// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../BdStable/Pools/BdStablePool.sol";
import "../BSM/Investors/AMM/AMMInvestorsHelper.sol";
import "hardhat/console.sol";

//todo
//use PausableUpgradeable?
//optimise gas usage
//use AMMInvestorsHelper (test for sovryn router)
contract ZapMint is OwnableUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bool public zapMintPaused;

    mapping(address => bool) private mapZapMintSupportedTokens;
    address[] public zapMintSupportedTokens;

    function initialize() external initializer {
        __Ownable_init();
        zapMintPaused = false;
    }

    function isSupportedForMinting(address _address) public view returns (bool) {
        return mapZapMintSupportedTokens[_address];
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

    function toggleZapMinting() external onlyOwner {
        zapMintPaused = !zapMintPaused;
    }

    function mintUniswapRouterOnly(
        uint256 bdxInMax,
        uint256 amountOutMin,
        bool useNativeToken,
        address bdstableToMint,
        address bdstablePoolAddress,
        address[] calldata path,
        uint256 amountIn,
        address router,
        uint256 deadline
    ) external payable nonReentrant {
        require(zapMintPaused == false, "ZapMint: Status is paused");
        require(path.length > 0, "ZapMint: Path is empty");
        require(mapZapMintSupportedTokens[path[0]], "ZapMint: Token not supported for zap minting");

        IERC20(path[0]).safeTransferFrom(msg.sender, payable(address(this)), amountIn);

        bool shouldSwap = path.length > 1;

        if (shouldSwap) {
            swapInternal(useNativeToken, path, amountIn, router, deadline);
        }

        address tokenToUseForMint = path[path.length - 1];
        uint256 amountOfTokenToUseForMint = useNativeToken ? address(this).balance : IERC20(tokenToUseForMint).balanceOf(address(this)); //todo add and use return value for swapInternal?
        mintInternal(tokenToUseForMint, amountOfTokenToUseForMint, bdxInMax, amountOutMin, useNativeToken, bdstablePoolAddress);

        uint256 thisBalanceOfStable = IERC20(bdstableToMint).balanceOf(address(this));
        IERC20(bdstableToMint).safeTransfer(payable(msg.sender), thisBalanceOfStable);
    }

    function swapInternal(
        bool useNativeToken,
        address[] calldata path,
        uint256 amountIn,
        address router,
        uint256 deadline
    ) private {
        IERC20(path[0]).approve(router, amountIn);
        if (useNativeToken) {
            IUniswapV2Router02(router).swapExactTokensForETH(amountIn, 0, path, address(this), deadline);
        } else {
            IUniswapV2Router02(router).swapExactTokensForTokens(amountIn, 0, path, address(this), deadline);
        }
    }

    function mintInternal(
        address tokenToUseForMint,
        uint256 amountIn,
        uint256 bdxInMax,
        uint256 amountOutMin,
        bool useNativeToken,
        address bdstablePoolAddress
    ) private {
        BdStablePool bdstablePool = BdStablePool(payable(bdstablePoolAddress));

        if (useNativeToken) {
            bdstablePool.mintFractionalBdStable{value: amountIn}(amountIn, bdxInMax, amountOutMin, useNativeToken);
        } else {
            IERC20(tokenToUseForMint).approve(bdstablePoolAddress, amountIn);
            bdstablePool.mintFractionalBdStable(amountIn, bdxInMax, amountOutMin, useNativeToken);
        }
    }

    receive() external payable {}

    event AddTokenSupportForMinting(address indexed token);
    event RemoveTokenSupportFromMinting(address indexed token);
}
