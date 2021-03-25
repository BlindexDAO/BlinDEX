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
// ========================= FRAXShares (FXS) =========================
// ====================================================================
// Frax Finance: https://github.com/FraxFinance

// Primary Author(s)
// Travis Moore: https://github.com/FortisFortuna
// Jason Huan: https://github.com/jasonhuan
// Sam Kazemian: https://github.com/samkazemian

// Reviewer(s) / Contributor(s)
// Sam Sun: https://github.com/samczsun

import "../Common/Context.sol";
import "../ERC20/ERC20Custom.sol";
import "../ERC20/IERC20.sol";
import "../Math/SafeMath.sol";
import "../Frax/BDStable.sol";

contract BDXShares is ERC20Custom {
    using SafeMath for uint256;

    /* ========== STATE VARIABLES ========== */

    string public symbol;
    string public name;
    uint8 public constant decimals = 18;
    address public FRAXStablecoinAdd;
    
    address public owner_address;
    address public oracle_address;
    address public _liquidity_rewards_manager;
    BDStable private BDSTABLE;


    /* ========== MODIFIERS ========== */

    modifier onlyPools() {
       require(BDSTABLE.bdstable_pools(msg.sender) == true, "Only bd pools can redeem new BD stable");
        _;
    } 
    modifier onlyPoolsOrLiquidityRewardsManager() {
       require(BDSTABLE.bdstable_pools(msg.sender) == true || msg.sender == _liquidity_rewards_manager, "Only bd pools or liquidity manager can mint new BD stable");
        _;
    } 
    
    modifier onlyByOwner() {
        require(msg.sender == owner_address, "You are not an owner");
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    constructor(
        string memory _name,
        string memory _symbol, 
        address _oracle_address,
        address _owner_address
    ) public {
        name = _name;
        symbol = _symbol;
        owner_address = _owner_address;
        oracle_address = _oracle_address;

    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setOracle(address new_oracle) external onlyByOwner {
        oracle_address = new_oracle;
    }

    
    function setBdStableAddress(address frax_contract_address) external onlyByOwner {
        BDSTABLE = BDStable(frax_contract_address);
    }
    
    function setLiquidityRewardsManagerAddress(address _liquidity_rewards_manager_address) external onlyByOwner {
        _liquidity_rewards_manager = _liquidity_rewards_manager_address;
    }
    
    function setOwner(address _owner_address) external onlyByOwner {
        owner_address = _owner_address;
    }

    function mint(address to, uint256 amount) public onlyPoolsOrLiquidityRewardsManager {
        _mint(to, amount);
    }

    // This function is what other frax pools will call to burn FXS 
    function burn_from(address b_address, uint256 b_amount) external onlyPools {
        super._burnFrom(b_address, b_amount);
    }

    /* ========== OVERRIDDEN PUBLIC FUNCTIONS ========== */

    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {

        _transfer(sender, recipient, amount);
        // Lukasz: Do we need lowering approvals?
        _approve(sender, _msgSender(), _allowances[sender][_msgSender()].sub(amount, "ERC20: transfer amount exceeds allowance"));

        return true;
    }

    /* ========== PUBLIC FUNCTIONS ========== */


    /* ========== INTERNAL FUNCTIONS ========== */


    /* ========== EVENTS ========== */
    
}
