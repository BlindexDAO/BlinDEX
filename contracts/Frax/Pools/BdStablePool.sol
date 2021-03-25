// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

// ====================================================================
// |     ______                   _______                             |
// |    / _____________ __  __   / ____(_____  ____ _____  ________   |
// |   / /_  / ___/ __ `| |/_/  / /_  / / __ \/ __ `/ __ \/ ___/ _ \  |
// |  / __/ / /  / /_/ _>  <   / __/ / / / / / /_/ / / / / /__/  __/  |
// | /_/   /_/   \__,_/_/|_|  /_/   /_/_/ /_/\__,_/_/ /_/\___/\___/   |
// |                                                                  |
// ====================================================================
// ============================= FraxPool =============================
// ====================================================================
// Frax Finance: https://github.com/FraxFinance

// Primary Author(s)
// Travis Moore: https://github.com/FortisFortuna
// Jason Huan: https://github.com/jasonhuan
// Sam Kazemian: https://github.com/samkazemian

// Reviewer(s) / Contributor(s)
// Sam Sun: https://github.com/samczsun

import "../../Math/SafeMath.sol";
import "../../FXS/BDXShares.sol";
import "../../Frax/BDStable.sol";
import "../../ERC20/ERC20.sol";
import "../../Oracle/UniswapPairOracle.sol";
import "../../Governance/AccessControl.sol";
import "hardhat/console.sol";

contract BdStablePool {
    using SafeMath for uint256;

    /* ========== STATE VARIABLES ========== */

    ERC20 private collateral_token;
    address private collateral_address;
    address private owner_address;

    address private bdstable_contract_address;
    address private bdx_contract_address;
    
    BDXShares private BDX;
    BDStable private BDSTABLE;

    address private weth_address;
    
    // AccessControl state variables
    bool public mintPaused = false;
    bool public redeemPaused = false;

    /* ========== MODIFIERS ========== */

    modifier onlyByOwner() {
        require(msg.sender == owner_address, "You are not the owner");
        _;
    }

    modifier notRedeemPaused() {
        require(redeemPaused == false, "Redeeming is paused");
        _;
    }

    modifier notMintPaused() {
        require(mintPaused == false, "Minting is paused");
        _;
    }
 
    /* ========== CONSTRUCTOR ========== */
    
    constructor(
        address _bdstable_contract_address,
        address _bdx_contract_address,
        address _collateral_address,
        address _creator_address
    ) public {
        BDSTABLE = BDStable(_bdstable_contract_address);
        BDX = BDXShares(_bdx_contract_address);
        bdstable_contract_address = _bdstable_contract_address;
        bdx_contract_address = _bdx_contract_address;
        collateral_address = _collateral_address;
        owner_address = _creator_address;
        collateral_token = ERC20(_collateral_address);
    }

    /* ========== VIEWS ========== */

    /* ========== PUBLIC FUNCTIONS ========== */

    // We separate out the 1t1, fractional and algorithmic minting functions for gas efficiency 
    function mintBdStable(uint256 collateral_amount) external notMintPaused {
        collateral_token.transferFrom(msg.sender, address(this), collateral_amount);
        uint256 bdstable_amount = collateral_amount;
        BDSTABLE.pool_mint(msg.sender, bdstable_amount);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */


    /* ========== EVENTS ========== */

}