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
    BDStable private BDSTABLE;


    /* ========== MODIFIERS ========== */

    modifier onlyPools() {
       require(BDSTABLE.bdstable_pools(msg.sender) == true, "Only bd pools can redeem new BD stable");
        _;
    }
    
    modifier onlyByOwner() {
        require(msg.sender == owner_address, "You are not an owner");
        _;
    }

    modifier onlyPoolsOrOwner() {
       require(BDSTABLE.bdstable_pools(msg.sender) == true || msg.sender == owner_address,
         "Only bd pools or owner can redeem new BD stable");
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    constructor(
        string memory _name,
        string memory _symbol, 
        address _owner_address
    ) public {
        name = _name;
        symbol = _symbol;
        owner_address = _owner_address;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setBdStableAddress(address frax_contract_address) external onlyByOwner {
        BDSTABLE = BDStable(frax_contract_address);
    }

    
    function setOwner(address _owner_address) external onlyByOwner {
        owner_address = _owner_address;
    }

    function mint(address to, uint256 amount) public onlyPoolsOrOwner {
        _mint(to, amount);
    }

    // This function is what other frax pools will call to mint new FXS (similar to the FRAX mint) 
    function pool_mint(address m_address, uint256 m_amount) external onlyPools {        
        // if(trackingVotes){
        //     uint32 srcRepNum = numCheckpoints[address(this)];
        //     uint96 srcRepOld = srcRepNum > 0 ? checkpoints[address(this)][srcRepNum - 1].votes : 0;
        //     uint96 srcRepNew = add96(srcRepOld, uint96(m_amount), "pool_mint new votes overflows");
        //     _writeCheckpoint(address(this), srcRepNum, srcRepOld, srcRepNew); // mint new votes
        //     trackVotes(address(this), m_address, uint96(m_amount));
        // } //todo ag

        super._mint(m_address, m_amount);
        // emit FXSMinted(address(this), m_address, m_amount); //todo ag
    }

    // This function is what other frax pools will call to burn FXS 
    function burn_from(address b_address, uint256 b_amount) external onlyPools {
        super._burnFrom(b_address, b_amount);
    }

    // This function is what other frax pools will call to burn FXS 
    function pool_burn_from(address b_address, uint256 b_amount) external onlyPools {
        // if(trackingVotes){
        //     trackVotes(b_address, address(this), uint96(b_amount));
        //     uint32 srcRepNum = numCheckpoints[address(this)];
        //     uint96 srcRepOld = srcRepNum > 0 ? checkpoints[address(this)][srcRepNum - 1].votes : 0;
        //     uint96 srcRepNew = sub96(srcRepOld, uint96(b_amount), "pool_burn_from new votes underflows");
        //     _writeCheckpoint(address(this), srcRepNum, srcRepOld, srcRepNew); // burn votes
        // }//todo ag

        super._burnFrom(b_address, b_amount);
        // emit FXSBurned(b_address, address(this), b_amount); //todo ag
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
