// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../BdStable/Pools/BdStablePool.sol";
import "../BSM/Investors/AMM/interfaces/ISovrynNetwork.sol";
import "../Utils/IWETH.sol";
import "../BSM/Investors/AMM/AMMInvestorsHelper.sol";

// TODO: What to do with price impacts and slippage??

contract ZapMint is OwnableUpgradeable, ReentrancyGuard {
    IWETH private nativeTokenWrapper;
    bool public zapMintPaused;

    AMMInvestorsHelper ammInvestorsHelper;

    mapping(address => bool) private mapZapMintSupportedTokens;
    address[] public zapMintSupportedTokens;

    /* ========== INITIALIZER ========== */

    function initialize(address _nativeTokenWrapper, address _ammInvestorsHelper) external initializer {
        __Ownable_init();

        require(owner() != address(0), "ZapMint: owner must be set");
        zapMintPaused = true;

        ammInvestorsHelper = AMMInvestorsHelper(_ammInvestorsHelper);

        nativeTokenWrapper = IWETH(_nativeTokenWrapper);
    }

    /* ========== View Functions ========== */

    function isSupportedForMinting(address _address) public view returns (bool) {
        return mapZapMintSupportedTokens[_address];
    }

    function supportedTokensForMintingLength() public view returns (uint256) {
        return zapMintSupportedTokens.length;
    }

    /* ========== External Functions ========== */

    // TODO: Do I need it??
    receive() external payable {
        require(msg.sender == address(nativeTokenWrapper), "Only the native token wrapper is allowed to send native token to this contract");
    }

    // TODO: Do I need the payable?? Or should I have another function to perform the mint with native token?
    function mint(
        uint256 collateral_amount_in_max,
        uint256 bdx_in_max,
        uint256 bdStableOutMin,
        bool useNativeToken, // True if the native token should be used after all the swaps occured
        address _bdstablePool,
        address[] memory tokens, // Length = Number of swaps + 1
        uint256[] memory amounts, // Length = Number of swaps + 1
        address[] memory routers, // Length = Number of swaps
        AMMInvestorsHelper.RouterTypes[] memory routersTypes, // Length = Number of swaps
        uint256 deadline
    ) external payable nonReentrant {
        require(zapMintPaused == false, "ZapMinting is paused");
        require(mapZapMintSupportedTokens[tokens[0]], "Token not supported for zap minting");

        // TODO - maybe change the parameters to: paths[], amounts[], routers[], routersTypes[]
        ammInvestorsHelper.performBestSwap(tokens, amounts, routers, routersTypes, deadline);

        BdStablePool bdstablePool = BdStablePool(payable(_bdstablePool));
        bdstablePool.mintFractionalBdStable(collateral_amount_in_max, bdx_in_max, bdStableOutMin, useNativeToken);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function toggleZapMinting() external onlyOwner {
        zapMintPaused = !zapMintPaused;
    }

    function setAMMInvestorsHelper(address _ammInvestorsHelper) external onlyOwner {
        ammInvestorsHelper = AMMInvestorsHelper(_ammInvestorsHelper);
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

    /* ========== EVENTS ========== */

    event AddTokenSupportForMinting(address indexed token);
    event RemoveTokenSupportFromMinting(address indexed token);
}
