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
// ======================= FRAXStablecoin (FRAX) ======================
// ====================================================================
// Frax Finance: https://github.com/FraxFinance

// Primary Author(s)
// Travis Moore: https://github.com/FortisFortuna
// Jason Huan: https://github.com/jasonhuan
// Sam Kazemian: https://github.com/samkazemian

// Reviewer(s) / Contributor(s)
// Sam Sun: https://github.com/samczsun

import "../Common/Context.sol";
import "../ERC20/IERC20.sol";
import "../ERC20/ERC20Custom.sol";
import "../ERC20/ERC20.sol";
import "../Math/SafeMath.sol";
import "../FXS/BDXShares.sol";
import "./Pools/FraxPool.sol";
import "../Oracle/UniswapPairOracle.sol";
import "../Oracle/ChainlinkETHFIATPriceConsumer.sol";
import "../Governance/AccessControl.sol";
import "../Uniswap/Interfaces/IUniswapV2PairOracle.sol";

contract BDStable is ERC20Custom {
    using SafeMath for uint256;

    /* ========== STATE VARIABLES ========== */
    string public symbol;
    string public name;
    string public fiat;
    uint8 public constant decimals = 18;
    address public owner_address;
    address public bdx_address;

    IUniswapV2PairOracle bdstableWethOracle;
    IUniswapV2PairOracle bdxWethOracle;

    // The addresses in this array are added by the oracle and these contracts are able to mint frax
    address[] public bdstable_pools_array;

    // Mapping is also used for faster verification
    mapping(address => bool) public bdstable_pools; 
    
    /* ========== MODIFIERS ========== */

    modifier onlyPools() {
       require(bdstable_pools[msg.sender] == true, "Only frax pools can call this function");
        _;
    } 
    
    modifier onlyByOwner() {
        require(msg.sender == owner_address, "You are not the owner");
        _;
    }

    modifier onlyByOwnerOrPool() {
        require(
            msg.sender == owner_address 
            || bdstable_pools[msg.sender] == true, 
            "You are not the owner or a pool");
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _fiat,
        address _owner_address,
        address _bdx_address
    ) public {
        name = _name;
        symbol = _symbol;
        fiat = _fiat;
        owner_address = _owner_address;
        bdx_address = _bdx_address;
    }

    /* ========== VIEWS ========== */

    /* ========== PUBLIC FUNCTIONS ========== */
    
    /* ========== RESTRICTED FUNCTIONS ========== */

    // Used by pools when user redeems
    function pool_burn_from(address b_address, uint256 b_amount) public onlyPools {
        super._burnFrom(b_address, b_amount);
    }

    // This function is what other frax pools will call to mint new FRAX 
    function pool_mint(address m_address, uint256 m_amount) public onlyPools {
        super._mint(m_address, m_amount);
    }

    // Adds collateral addresses supported, such as tether and busd, must be ERC20 
    function addPool(address pool_address) public onlyByOwner {
        require(bdstable_pools[pool_address] == false, "address already exists");
        bdstable_pools[pool_address] = true; 
        bdstable_pools_array.push(pool_address);
    }

    // Remove a pool 
    function removePool(address pool_address) public onlyByOwner {
        require(bdstable_pools[pool_address] == true, "address doesn't exist already");
        
        // Delete from the mapping
        delete bdstable_pools[pool_address];

        // 'Delete' from the array by setting the address to 0x0
        for (uint i = 0; i < bdstable_pools_array.length; i++){ 
            if (bdstable_pools_array[i] == pool_address) {
                bdstable_pools_array[i] = address(0); // This will leave a null in the array and keep the indices the same
                break;
            }
        }
    }

    function setBDStable_WETH_Oracle(address _bdstable_oracle_addr) public { //todo onlyByOwnerOrGovernance
        bdstableWethOracle = IUniswapV2PairOracle(_bdstable_oracle_addr); 
    }

    function setBDX_WETH_Oracle(address _bdx_oracle_addr) public { // todo onlyByOwnerOrGovernance
        bdxWethOracle = IUniswapV2PairOracle(_bdx_oracle_addr);
    }

    /* ========== EVENTS ========== */
}
