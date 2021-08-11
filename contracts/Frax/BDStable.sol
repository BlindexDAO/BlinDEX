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
import "../Oracle/ChainlinkBasedCryptoFiatFeed.sol";
import "../Oracle/ICryptoPairOracle.sol";
import "./Pools/BdStablePool.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "hardhat/console.sol";

contract BDStable is ERC20Custom, Initializable {
    using SafeMath for uint256;

    /* ========== STATE VARIABLES ========== */
    enum PriceChoice { BDSTABLE, BDX }

    uint8 public constant decimals = 18;
    uint256 private constant PRICE_PRECISION = 1e12; //increase because we are no longer base on stablecoins

    string public symbol;
    string public name;
    string public fiat;
    address public owner_address;
    address public bdx_address;

    ICryptoPairOracle bdstableWethOracle;
    ICryptoPairOracle bdxWethOracle;

    ChainlinkBasedCryptoFiatFeed private weth_fiat_pricer;
    uint8 private weth_fiat_pricer_decimals;

    uint256 public global_collateral_ratio_d12; // 12 decimals of precision
    
    address public weth_address;

    // The addresses in this array are added by the oracle and these contracts are able to mint bdStable
    address[] public bdstable_pools_array;

    // Mapping is also used for faster verification
    mapping(address => bool) public bdstable_pools; 

    uint256 public bdStable_step_d12; // Amount to change the collateralization ratio by upon refreshCollateralRatio()
    uint256 public refresh_cooldown; // Seconds to wait before being able to run refreshCollateralRatio() again
    uint256 public price_target; // The price of BDSTABLE at which the collateral ratio will respond to; this value is only used for the collateral ratio mechanism and not for minting and redeeming which are hardcoded at 1 <fiat>
    uint256 public price_band; // The bound above and below the price target at which the refreshCollateralRatio() will not change the collateral ratio

    bool public collateral_ratio_paused;

    /* ========== MODIFIERS ========== */

    modifier onlyPools() {
       require(bdstable_pools[msg.sender] == true, "Only bd pools can call this function");
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

    function initialize (
        string memory _name,
        string memory _symbol,
        string memory _fiat,
        address _owner_address,
        address _bdx_address,
        uint256 _initalBdStableToOwner_d18
    ) 
        public 
        initializer
    {
        name = _name;
        symbol = _symbol;
        fiat = _fiat;
        owner_address = _owner_address;
        bdx_address = _bdx_address;

        bdStable_step_d12 = uint256(1e12).mul(25).div(10000); // 12 decimals of precision, equal to 0.25%
        global_collateral_ratio_d12 = uint256(1e12); // Bdstable system starts off fully collateralized (12 decimals of precision)
        price_target = uint256(1e12); // Collateral ratio will adjust according to the 1 <fiat> price target at genesis
        price_band = uint256(1e12).mul(50).div(10000); // Collateral ratio will not adjust if between 0.995<fiat> and 1.005<fiat> at genesis
        refresh_cooldown = 3600; // Refresh cooldown period is set to 1 hour (3600 seconds) at genesis

        collateral_ratio_paused = false;

        if(_initalBdStableToOwner_d18 > 0) {
            _mint(_owner_address, _initalBdStableToOwner_d18); // so owner can provide liqidity to swaps and we could get prices from the swaps
        }
    }

    /* ========== VIEWS ========== */

    function allPools() public view returns (address[] memory) {
        return bdstable_pools_array;
    }

    // collateral value in fiat corresponding to the stable
    // Iterate through all bd pools and calculate all value of collateral in all pools globally 
    function globalCollateralValue() public view returns (uint256) {
        uint256 total_collateral_value_d18 = 0; 

        for (uint i = 0; i < bdstable_pools_array.length; i++){ 
            // Exclude null addresses
            if (bdstable_pools_array[i] != address(0)){
                total_collateral_value_d18 = total_collateral_value_d18.add(BdStablePool(bdstable_pools_array[i]).collatFiatBalance());
            }

        }
        return total_collateral_value_d18;
    }

    // Choice = 'BDSTABLE' or 'BDX' for now
    function oracle_price(PriceChoice choice) internal view returns (uint256) {
        // Get the ETH / USD price first, and cut it down to 1e12 precision
        uint256 weth_fiat_price = uint256(weth_fiat_pricer.getPrice_1e12()).mul(PRICE_PRECISION).div(uint256(10) ** weth_fiat_pricer_decimals);
        uint256 price_vs_weth;

        if (choice == PriceChoice.BDSTABLE) {
            price_vs_weth = uint256(bdstableWethOracle.consult(weth_address, PRICE_PRECISION)); // How much BDSTABLE if you put in PRICE_PRECISION WETH
        }
        else if (choice == PriceChoice.BDX) {
            price_vs_weth = uint256(bdxWethOracle.consult(weth_address, PRICE_PRECISION)); // How much BDX if you put in PRICE_PRECISION WETH
        }
        else revert("INVALID PRICE CHOICE. Needs to be either 0 (BDSTABLE) or 1 (BDX)");

        // Will be in 1e12 format
        return weth_fiat_price.mul(PRICE_PRECISION).div(price_vs_weth);
    }
    
    function updateOraclesIfNeeded() public {
        if(bdxWethOracle.shouldUpdateOracle()){
            bdxWethOracle.updateOracle();
        }

        if(bdstableWethOracle.shouldUpdateOracle()){
            bdstableWethOracle.updateOracle();
        } 
    }

    function shouldUpdateOracles() public view returns (bool) {
        return bdxWethOracle.shouldUpdateOracle() || bdstableWethOracle.shouldUpdateOracle(); 
    }

    // Returns BDSTABLE / <fiat>
    function bdstable_price_d12() public view returns (uint256) {
        return oracle_price(PriceChoice.BDSTABLE);
    }

    // Returns BDX / <fiat>
    function BDX_price_d12() public view returns (uint256) {
        return oracle_price(PriceChoice.BDX);
    }
    /* ========== PUBLIC FUNCTIONS ========== */

    // There needs to be a time interval that this can be called. Otherwise it can be called multiple times per expansion.
    uint256 public refreshCollateralRatio_last_call_time; // Last time the collateral ration was refreshed function was executed
    function refreshCollateralRatio() public {
        if(collateral_ratio_paused == true){
            return;
        }

        if(block.timestamp - refreshCollateralRatio_last_call_time < refresh_cooldown){
            return;
        }

        if(bdstableWethOracle.shouldUpdateOracle()){
            bdstableWethOracle.updateOracle();
        }

        uint256 bdstable_price_cur = bdstable_price_d12();

        // Step increments are 0.25% (upon genesis, changable) 

        if (bdstable_price_cur > price_target.add(price_band)) { //decrease collateral ratio
            if(global_collateral_ratio_d12 <= bdStable_step_d12){ //if within a step of 0, go to 0
                global_collateral_ratio_d12 = 0;
            } else {
                global_collateral_ratio_d12 = global_collateral_ratio_d12.sub(bdStable_step_d12);
            }
        } else if (bdstable_price_cur < price_target.sub(price_band)) { //increase collateral ratio
            if(global_collateral_ratio_d12.add(bdStable_step_d12) >= 1e12){
                global_collateral_ratio_d12 = 1e12; // cap collateral ratio at 1.000000
            } else {
                global_collateral_ratio_d12 = global_collateral_ratio_d12.add(bdStable_step_d12);
            }
        }

        refreshCollateralRatio_last_call_time = block.timestamp; // Set the time of the last expansion

        emit CollateralRatioRefreshed(global_collateral_ratio_d12);
    }
    
    function effective_global_collateral_ratio_d12() public view returns (uint256) {
        uint256 bdStable_total_supply = totalSupply();
        uint256 global_collat_value = globalCollateralValue();
        uint256 efCR = global_collat_value.mul(1e12).div(bdStable_total_supply);
        return efCR;
    }

    function weth_fiat_price() public view returns (uint256) {
        return uint256(weth_fiat_pricer.getPrice_1e12()).mul(PRICE_PRECISION).div(uint256(10) ** weth_fiat_pricer_decimals);
    }
    
    /* ========== RESTRICTED FUNCTIONS ========== */

    // Used by pools when user redeems
    function pool_burn_from(address b_address, uint256 b_amount) public onlyPools {
        super._burnFrom(b_address, b_amount);

        emit BdStableBurned(b_address, msg.sender, b_amount);
    }

    // This function is what other bd pools will call to mint new bd stable 
    function pool_mint(address m_address, uint256 m_amount) public onlyPools {
        super._mint(m_address, m_amount);
        
        emit BdStableMinted(msg.sender, m_address, m_amount);
    }

    // Adds collateral addresses supported, such as tether and busd, must be ERC20 
    function addPool(address pool_address) public onlyByOwner {
        require(bdstable_pools[pool_address] == false, "address already exists");
        bdstable_pools[pool_address] = true; 
        bdstable_pools_array.push(pool_address);

        emit PoolAdded(pool_address);
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

        emit PoolRemoved(pool_address);
    }

    function setBDStable_WETH_Oracle(address _bdstable_oracle_addr, address _weth_address) public onlyByOwner {
        bdstableWethOracle = ICryptoPairOracle(_bdstable_oracle_addr); 
        weth_address = _weth_address;

        emit BDStable_WETH_OracleSet(_bdstable_oracle_addr, _weth_address);
    }

    function setBDX_WETH_Oracle(address _bdx_oracle_addr, address _weth_address) public onlyByOwner {
        bdxWethOracle = ICryptoPairOracle(_bdx_oracle_addr);
        weth_address = _weth_address;

        emit BDX_WETH_OracleSet(_bdx_oracle_addr, _weth_address);
    }
    
    function setETH_fiat_Oracle(address _eth_fiat_consumer_address) public onlyByOwner {
        weth_fiat_pricer = ChainlinkBasedCryptoFiatFeed(_eth_fiat_consumer_address);
        weth_fiat_pricer_decimals = weth_fiat_pricer.getDecimals();
        
        emit EthFiatOracleSet(_eth_fiat_consumer_address);
    }

    function setBdStable_step_d12(uint256 _bdStable_step_d12) external onlyByOwner {
        bdStable_step_d12 = _bdStable_step_d12;

        emit BdStableStepSet(_bdStable_step_d12);
    }

    function toggleCollateralRatioPaused() external onlyByOwner {
        collateral_ratio_paused = !collateral_ratio_paused;

        emit CollateralRatioPausedToggled(collateral_ratio_paused);
    }

    function lockCollateralRatioAt(uint256 wantedCR_d12) external onlyByOwner {
        global_collateral_ratio_d12 = wantedCR_d12;
        collateral_ratio_paused = true;

        emit CollateralRatioLocked(wantedCR_d12);
    }

    /* ========== EVENTS ========== */
    
    event CollateralRatioRefreshed(uint256 global_collateral_ratio);
    event BdStableBurned(address indexed from, address indexed to, uint256 amount);
    event BdStableMinted(address indexed from, address indexed to, uint256 amount);
    event PoolAdded(address pool_address);
    event PoolRemoved(address pool_address);
    event BDStable_WETH_OracleSet(address indexed bdstable_oracle_addr, address indexed weth_address);
    event BDX_WETH_OracleSet(address indexed bdx_oracle_address, address indexed weth_address);
    event EthFiatOracleSet(address eth_fiat_consumer_address);
    event BdStableStepSet(uint256 bdStable_step_d12);
    event CollateralRatioPausedToggled(bool collateral_ratio_paused);
    event CollateralRatioLocked(uint256 lockedCR_d12);
}
