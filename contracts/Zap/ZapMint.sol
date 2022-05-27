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

    function swapToZapMintAndMintAllPairsTest(
        address router,
        uint256 amountIn,
        address[] calldata path,
        uint256 deadline,
        address poolAddress,
        bool useNativeToken
    ) external payable {
        require(zapMintPaused == false, "ZapMint: status is paused");
        console.log("router address", router);
        console.log("sender address", msg.sender);
        console.log("deployer allows router to withdraw that amount of token1:", IERC20(path[0]).allowance(msg.sender, router));
        console.log("deployer allows router to withdraw that amount of token2:", IERC20(path[1]).allowance(msg.sender, router));
        console.log("deployer allows this to withdraw that amount of token1:", IERC20(path[0]).allowance(msg.sender, address(this)));
        console.log("deployer allows this to withdraw that amount of token2:", IERC20(path[1]).allowance(msg.sender, address(this)));
        console.log("this balance of token1:", IERC20(path[0]).balanceOf(address(this)));
        console.log("this balance of token2:", IERC20(path[1]).balanceOf(address(this)));
        console.log("amountin", amountIn);
        console.log("path0", path[0]);
        console.log("path1", path[1]);
        console.log("deadline", deadline);
        if (path.length > 2) {
            console.log("path2", path[2]);
        }

        address tokenToSwapFrom = path[0];
        address tokenToMint = path[path.length - 1];
        IERC20(tokenToSwapFrom).safeTransferFrom(msg.sender, payable(address(this)), amountIn); //get token from sender

        console.log("this balance of token1 after transfer from sender:", IERC20(path[0]).balanceOf(address(this)));
        console.log("this balance of token2 after transfer from sender:", IERC20(path[1]).balanceOf(address(this)));
        if (path.length > 2) {
            console.log("this balance of token3 after transfer from sender:", IERC20(path[2]).balanceOf(address(this)));
        }

        IERC20(tokenToSwapFrom).approve(router, amountIn); //approve token for use in router
        if (useNativeToken) {
            IUniswapV2Router02(router).swapExactTokensForETH(amountIn, 0, path, address(this), deadline);
        } else {
            console.log("swapping exact tokens for tokens");
            IUniswapV2Router02(router).swapExactTokensForTokens(amountIn, 0, path, address(this), deadline); // swap methods spends token from sender (which is ZapMint)
        }

        console.log("this balance of token1 after swap:", IERC20(path[0]).balanceOf(address(this)));
        console.log("this balance of token2 after swap:", IERC20(path[1]).balanceOf(address(this)));
        if (path.length > 2) {
            console.log("this balance of token3 after swap:", IERC20(path[2]).balanceOf(address(this)));
        }

        uint256 thisAmountOfTokenToMint = IERC20(tokenToMint).balanceOf(address(this));
        IERC20(tokenToMint).approve(poolAddress, thisAmountOfTokenToMint); //approve token for use in bdstablePool
        BdStablePool bdstablePool = BdStablePool(payable(poolAddress));

        uint256 amountForMint = IERC20(tokenToMint).balanceOf(address(this));
        bdstablePool.mintFractionalBdStable(amountForMint, 0, 0, false);

        address mintedStableAddress = address(bdstablePool.BDSTABLE());
        console.log("this balance of token1 after mint:", IERC20(path[0]).balanceOf(address(this)));
        console.log("this balance of token2 after mint:", IERC20(path[1]).balanceOf(address(this)));
        if (path.length > 2) {
            console.log("this balance of token3 after mint:", IERC20(path[2]).balanceOf(address(this)));
        }
        console.log("this balance of stable after mint:", IERC20(mintedStableAddress).balanceOf(address(this)));

        uint256 thisBalanceOfStable = IERC20(mintedStableAddress).balanceOf(address(this));
        IERC20(mintedStableAddress).approve(msg.sender, thisBalanceOfStable);
        IERC20(mintedStableAddress).safeTransfer(payable(msg.sender), thisBalanceOfStable);

        console.log("this balance of token1 after transfer back to sender:", IERC20(path[0]).balanceOf(address(this)));
        console.log("this balance of token2 after transfer back to sender:", IERC20(path[1]).balanceOf(address(this)));
        if (path.length > 2) {
            console.log("this balance of token3 after transfer back to sender:", IERC20(path[2]).balanceOf(address(this)));
        }
        console.log("this balance of stable after transfer back to sender:", IERC20(mintedStableAddress).balanceOf(address(this)));
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

        console.log("router address", router);
        console.log("sender address", msg.sender);
        console.log("this address", address(this));
        console.log("deployer allows router to withdraw that amount of token1:", IERC20(path[0]).allowance(msg.sender, router));
        console.log("deployer allows router to withdraw that amount of token2:", IERC20(path[1]).allowance(msg.sender, router));
        console.log("deployer allows this to withdraw that amount of token1:", IERC20(path[0]).allowance(msg.sender, address(this)));
        console.log("deployer allows this to withdraw that amount of token2:", IERC20(path[1]).allowance(msg.sender, address(this)));
        console.log("this balance of token1:", IERC20(path[0]).balanceOf(address(this)));
        console.log("this balance of token2:", IERC20(path[1]).balanceOf(address(this)));
        console.log("amountin", amountIn);
        console.log("path0", path[0]);
        console.log("path1", path[1]);
        console.log("deadline", deadline);
        if (path.length > 2) {
            console.log("path2", path[2]);
        }

        IERC20(path[0]).safeTransferFrom(msg.sender, payable(address(this)), amountIn); //get token from sender

        console.log("this balance of token1 after transfer from sender:", IERC20(path[0]).balanceOf(address(this)));
        console.log("this balance of token2 after transfer from sender:", IERC20(path[1]).balanceOf(address(this)));
        if (path.length > 2) {
            console.log("this balance of token3 after transfer from sender:", IERC20(path[2]).balanceOf(address(this)));
        }
        console.log("this balance of native token after transfer from sender: ", address(this).balance);
        bool shouldSwap = path.length > 1;

        console.log("shouldSwap: ", shouldSwap);
        if (shouldSwap) {
            swapInternal(useNativeToken, path, amountIn, router, deadline);
        }

        console.log("this balance of token1 after swap:", IERC20(path[0]).balanceOf(address(this)));
        console.log("this balance of token2 after swap:", IERC20(path[1]).balanceOf(address(this)));
        if (path.length > 2) {
            console.log("this balance of token3 after swap:", IERC20(path[2]).balanceOf(address(this)));
        }
        console.log("this balance of native token after swap:", address(this).balance);
        address tokenToUseForMint = path[path.length - 1];

        uint256 amountOfTokenToUseForMint = useNativeToken ? address(this).balance : IERC20(tokenToUseForMint).balanceOf(address(this));
        console.log("minting bro");
        console.log("amountoftokenformint: ", amountOfTokenToUseForMint);
        mintInternal(tokenToUseForMint, amountOfTokenToUseForMint, bdxInMax, amountOutMin, useNativeToken, bdstablePoolAddress);

        console.log("this balance of token1 after mint:", IERC20(path[0]).balanceOf(address(this)));
        console.log("this balance of token2 after mint:", IERC20(path[1]).balanceOf(address(this)));
        if (path.length > 2) {
            console.log("this balance of token3 after mint:", IERC20(path[2]).balanceOf(address(this)));
        }
        console.log("this balance of native after mint:", address(this).balance);
        console.log("this balance of stable after mint:", IERC20(bdstableToMint).balanceOf(address(this)));
        uint256 thisBalanceOfStable = IERC20(bdstableToMint).balanceOf(address(this));
        console.log("mint result: ", thisBalanceOfStable);
        IERC20(bdstableToMint).safeTransfer(payable(msg.sender), thisBalanceOfStable);
    }

    function swapTest(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 amountIn,
        address router,
        uint256 deadline
    ) external {
        console.log("router address", router);
        console.log("sender address", msg.sender);
        console.log("deployer allows router to withdraw that amount of token1:", IERC20(path[0]).allowance(msg.sender, router));
        console.log("deployer allows router to withdraw that amount of token2:", IERC20(path[1]).allowance(msg.sender, router));
        console.log("deployer allows this to withdraw that amount of token1:", IERC20(path[0]).allowance(msg.sender, address(this)));
        console.log("deployer allows this to withdraw that amount of token2:", IERC20(path[1]).allowance(msg.sender, address(this)));
        console.log("this balance of token1:", IERC20(path[0]).balanceOf(address(this)));
        console.log("this balance of token2:", IERC20(path[1]).balanceOf(address(this)));
        console.log("amountin", amountIn);
        console.log("path0", path[0]);
        console.log("path1", path[1]);
        console.log("deadline", deadline);

        //    IERC20(token1).approve(address(this), 9e18);
        //    IERC20(token2).approve(address(this), 9e18);
        //    IERC20(token1).approve(address(router), 9e18);
        //    IERC20(token2).approve(address(router), 9e18);
        IERC20(path[0]).safeTransferFrom(msg.sender, payable(address(this)), 1e18); //get token from sender
        IERC20(path[0]).approve(router, amountIn); //approve token for use in router

        IUniswapV2Router02(router).swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), deadline); // this method spends token from sender (which is ZapMintTest)
    }

    function swapTest2(
        bool useNativeToken,
        address[] calldata path,
        uint256 amountIn,
        address router,
        uint256 deadline
    ) external {
        console.log("ETH balance before swap: ", address(this).balance);
        IERC20(path[0]).safeTransferFrom(msg.sender, payable(address(this)), 1e18); //todo remove this line
        // console.log("swapping");
        // console.log("path", path[0]);
        // console.log("this address inside swap ", address(this));
        // console.log("sender address inside swap ", msg.sender);
        IERC20(path[0]).approve(router, amountIn);
        // console.log("zap mint allows router to withdraw that amount of token1:", IERC20(path[0]).allowance(address(this), router));
        // if (useNativeToken) {
        IUniswapV2Router02(router).swapExactTokensForETH(amountIn, 0, path, address(this), deadline);
        //     console.log("amounts: ", amounts[0]);
        //     console.log("amounts: ", amounts[1]);
        //     if(amounts.length > 2){
        //         console.log("amounts: ", amounts[2]);
        //     }
        // } else {
        // IUniswapV2Router02(router).swapExactTokensForTokens(amountIn, 0, path, address(this), deadline); // swap methods spends token from sender (which is ZapMint)
        // }

        //             console.log("this balance of token1 after swap:", IERC20(path[0]).balanceOf(address(this)));
        //             console.log("this balance of token2 after swap:", IERC20(path[1]).balanceOf(address(this)));
        //             if (path.length > 2) {
        //                 console.log("this balance of token3 after swap:", IERC20(path[2]).balanceOf(address(this)));
        //             }

        // address payable self = address(this);
        // uint256 balance = self.balance;
        console.log("ETH balance after swap: ", address(this).balance);
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
            IUniswapV2Router02(router).swapExactTokensForTokens(amountIn, 0, path, address(this), deadline); // swap methods spends token from sender (which is ZapMint)
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
