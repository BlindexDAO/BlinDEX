// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "../Bdx/BDXShares.sol";
import "../Oracle/IOracleBasedCryptoFiatFeed.sol";
import "../Oracle/ICryptoPairOracle.sol";
import "./Pools/BdStablePool.sol";
import "./Pools/BdPoolLibrary.sol";

contract BDStable is ERC20Upgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */
    enum PriceChoice { BDSTABLE, BDX }

    uint8 private constant MAX_NUMBER_OF_POOLS = 32;
    uint256 public unclaimedPoolsBDX;

    string public fiat;
    address public treasury_address; // used by pools
    IERC20 private BDX;

    ICryptoPairOracle private bdstableWethOracle;
    ICryptoPairOracle private bdxWethOracle;

    IOracleBasedCryptoFiatFeed private weth_fiat_pricer;

    uint256 public global_collateral_ratio_d12; // 12 decimals of precision
    
    address public weth_address;

    // The addresses in this array are added by the oracle and these contracts are able to mint bdStable
    address payable[] public bdstable_pools_array;

    // Mapping is also used for faster verification
    mapping(address => bool) public bdstable_pools; 

    uint256 public bdStable_step_d12; // Amount to change the collateralization ratio by upon refreshCollateralRatio()
    uint256 public refresh_cooldown; // Seconds to wait before being able to run refreshCollateralRatio() again
    uint256 public price_target_d12; // The price of BDSTABLE at which the collateral ratio will respond to; this value is only used for the collateral ratio mechanism and not for minting and redeeming which are hardcoded at 1 <fiat>
    uint256 public price_band_d12; // The bound above and below the price target at which the refreshCollateralRatio() will not change the collateral ratio

    uint256 private minimumMintRedeemDelayInBlocks = 1;

    bool public collateral_ratio_paused;

    mapping(address => uint256) public lastMintByUserBlock;

    // There needs to be a time interval that this can be called. Otherwise it can be called multiple times per expansion.
    uint256 public refreshCollateralRatio_last_call_time; // Last time the collateral ration was refreshed function was executed

    /* ========== MODIFIERS ========== */

    modifier onlyPools() {
       require(bdstable_pools[msg.sender] == true, "Only bd pools can call this function");
        _;
    } 

    modifier onlyOwnerOrPool() {
        require(
            msg.sender == owner()
            || bdstable_pools[msg.sender] == true, 
            "You are not the owner or a pool");
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    function initialize (
        string memory _name,
        string memory _symbol,
        string memory _fiat,
        address _treasury_address,
        address _bdx_address,
        uint256 _initalBdStableToOwner_d18
    ) 
        external 
        initializer
    {
        __ERC20_init(_name, _symbol);
        __Ownable_init();

        fiat = _fiat;
        treasury_address = _treasury_address;
        BDX = IERC20(_bdx_address);

        bdStable_step_d12 = uint256(BdPoolLibrary.PRICE_PRECISION).mul(25).div(10000); // 12 decimals of precision, equal to 0.25%
        global_collateral_ratio_d12 = uint256(BdPoolLibrary.COLLATERAL_RATIO_MAX); // Bdstable system starts off fully collateralized (12 decimals of precision)
        price_target_d12 = uint256(BdPoolLibrary.PRICE_PRECISION); // Collateral ratio will adjust according to the 1 <fiat> price target at genesis
        price_band_d12 = uint256(BdPoolLibrary.PRICE_PRECISION).mul(50).div(10000); // Collateral ratio will not adjust if between 0.995<fiat> and 1.005<fiat> at genesis
        refresh_cooldown = 3600; // Refresh cooldown period is set to 1 hour (3600 seconds) at genesis

        if(_initalBdStableToOwner_d18 > 0) {
            _mint(owner(), _initalBdStableToOwner_d18); // so owner can provide liqidity to swaps and we could get prices from the swaps
        }
    }

    /* ========== VIEWS ========== */

    function getBdStablesPoolsLength() external view returns (uint256) {
        return bdstable_pools_array.length;
    }

    // collateral value in fiat corresponding to the stable
    // Iterate through all bd pools and calculate all value of collateral in all pools globally 
    function globalCollateralValue() public view returns (uint256) {
        uint256 total_collateral_value_d18 = 0; 

        // bdstable_pools_array.length is limited by addPool function
        for (uint i = 0; i < bdstable_pools_array.length; i++){ 
            total_collateral_value_d18 = total_collateral_value_d18.add(BdStablePool(bdstable_pools_array[i]).collatFiatBalance());
        }
        return total_collateral_value_d18;
    }

    // Choice = 'BDSTABLE' or 'BDX' for now
    function oracle_price(PriceChoice choice) internal view returns (uint256) {
        uint256 weth_fiat_price_d12 = weth_fiat_price();
        uint256 price_vs_weth;

        if (choice == PriceChoice.BDSTABLE) {
            price_vs_weth = uint256(bdstableWethOracle.consult(weth_address, BdPoolLibrary.PRICE_PRECISION)); // How much BDSTABLE if you put in BdPoolLibrary.PRICE_PRECISION WETH
        }
        else if (choice == PriceChoice.BDX) {
            price_vs_weth = uint256(bdxWethOracle.consult(weth_address, BdPoolLibrary.PRICE_PRECISION)); // How much BDX if you put in BdPoolLibrary.PRICE_PRECISION WETH
        }
        else revert("INVALID PRICE CHOICE. Needs to be either 0 (BDSTABLE) or 1 (BDX)");

        return weth_fiat_price_d12.mul(BdPoolLibrary.PRICE_PRECISION).div(price_vs_weth);
    }
    
    function updateOraclesIfNeeded() external {
        if(bdxWethOracle.shouldUpdateOracle()){
            bdxWethOracle.updateOracle();
        }

        if(bdstableWethOracle.shouldUpdateOracle()){
            bdstableWethOracle.updateOracle();
        } 
    }

    function shouldUpdateOracles() external view returns (bool) {
        return bdxWethOracle.shouldUpdateOracle() || bdstableWethOracle.shouldUpdateOracle(); 
    }

    // Returns BDSTABLE / <fiat>
    function bdstable_price_d12() public view returns (uint256) {
        return oracle_price(PriceChoice.BDSTABLE);
    }

    // Returns BDX / <fiat>
    function BDX_price_d12() external view returns (uint256) {
        return oracle_price(PriceChoice.BDX);
    }

    function effective_global_collateral_ratio_d12() public view returns (uint256) {
        uint256 bdStable_total_supply = totalSupply();
        uint256 global_collat_value = globalCollateralValue();
        uint256 efCR = global_collat_value.mul(BdPoolLibrary.PRICE_PRECISION).div(bdStable_total_supply);
        return efCR;
    }

    function weth_fiat_price() public view returns (uint256) {
        return uint256(weth_fiat_pricer.getPrice_1e12());
    }
    
    function canLegallyRedeem(address who) external view returns (bool) {
        return block.number.sub(lastMintByUserBlock[who]) >= minimumMintRedeemDelayInBlocks;
    }

    // Returns the value of excess collateral held in all BdStablePool related to this BdStable, compared to what is needed to maintain the global collateral ratio
    function availableExcessCollatDV() external view returns (uint256) {
        uint256 total_supply = totalSupply();
        uint256 global_collat_value = globalCollateralValue();

        // Calculates collateral needed to back each 1 BdStable with $1 of collateral at current collat ratio
        uint256 required_collat_fiat_value_d18 = total_supply
            .mul(global_collateral_ratio_d12)
            .div(BdPoolLibrary.COLLATERAL_RATIO_MAX); 

        if (global_collat_value > required_collat_fiat_value_d18) {
            return global_collat_value.sub(required_collat_fiat_value_d18);
        } else {
            return 0;
        }
    }

    /* ========== PUBLIC FUNCTIONS ========== */

    function when_should_refresh_collateral_ratio_in_seconds() public view returns (uint256) {
        uint256 secondsSinceLastRefresh = block.timestamp - refreshCollateralRatio_last_call_time;

        return secondsSinceLastRefresh > refresh_cooldown 
            ? 0 
            : (refresh_cooldown - secondsSinceLastRefresh);
    }

    function refreshCollateralRatio() external {
        if(collateral_ratio_paused == true){
            return;
        }

        if(when_should_refresh_collateral_ratio_in_seconds() > 0){
            return;
        }

        if(bdstableWethOracle.shouldUpdateOracle()){
            bdstableWethOracle.updateOracle();
        }

        uint256 bdstable_price_cur = bdstable_price_d12();

        // Step increments are 0.25% (upon genesis, changable) 

        if (bdstable_price_cur > price_target_d12.add(price_band_d12)) { //decrease collateral ratio
            if(global_collateral_ratio_d12 <= bdStable_step_d12){ //if within a step of 0, go to 0
                global_collateral_ratio_d12 = 0;
            } else {
                global_collateral_ratio_d12 = global_collateral_ratio_d12.sub(bdStable_step_d12);
            }
        } else if (bdstable_price_cur < price_target_d12.sub(price_band_d12)) { //increase collateral ratio
            if(global_collateral_ratio_d12.add(bdStable_step_d12) >= BdPoolLibrary.COLLATERAL_RATIO_MAX){
                global_collateral_ratio_d12 = BdPoolLibrary.COLLATERAL_RATIO_MAX; // cap collateral ratio at 1.000000
            } else {
                global_collateral_ratio_d12 = global_collateral_ratio_d12.add(bdStable_step_d12);
            }
        }

        refreshCollateralRatio_last_call_time = block.timestamp; // Set the time of the last expansion

        emit CollateralRatioRefreshed(global_collateral_ratio_d12);
    }
    
    function get_effective_bdx_coverage_ratio() external view returns (uint256) {
        uint256 effective_collateral_ratio_d12 = effective_global_collateral_ratio_d12();

        uint256 cr = global_collateral_ratio_d12 > effective_collateral_ratio_d12 
            ? effective_collateral_ratio_d12 
            : global_collateral_ratio_d12;

        uint256 expectedBdxValue_d18 = 
            BdPoolLibrary.COLLATERAL_RATIO_MAX.sub(cr)
            .mul(totalSupply())
            .div(BdPoolLibrary.COLLATERAL_RATIO_PRECISION);

        if(expectedBdxValue_d18 == 0){
            return BdPoolLibrary.COLLATERAL_RATIO_MAX; // in we need no BDX, the coverage is 100%
        } 

        uint256 bdxPrice_d12 = oracle_price(PriceChoice.BDX);

        if(bdxPrice_d12 == 0){
            return 0; // in we need BDX but BDX price is 0, the coverage is 0%
        } 

        uint256 expectedBdx_d18 = expectedBdxValue_d18
            .mul(BdPoolLibrary.PRICE_PRECISION)
            .div(bdxPrice_d12);

        uint256 bdxSupply_d18 = BDX.balanceOf(address(this)).sub(unclaimedPoolsBDX);
        uint256 effectiveBdxCR_d12 = BdPoolLibrary
            .PRICE_PRECISION
            .mul(bdxSupply_d18)
            .div(expectedBdx_d18);

        return effectiveBdxCR_d12 > BdPoolLibrary.COLLATERAL_RATIO_MAX ? BdPoolLibrary.COLLATERAL_RATIO_MAX : effectiveBdxCR_d12;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    // Used by pools when user redeems
    function pool_burn_from(address b_address, uint256 b_amount) external onlyPools {
        burnFrom(b_address, b_amount);

        emit BdStableBurned(b_address, msg.sender, b_amount);
    }

    // This function is what other bd pools will call to mint new bd stable 
    function pool_mint(address m_address, uint256 m_amount) external onlyPools {
        super._mint(m_address, m_amount);
        
        lastMintByUserBlock[m_address] = block.number;

        emit BdStableMinted(msg.sender, m_address, m_amount);
    }

    // Adds collateral addresses supported, such as tether and busd, must be ERC20 
    function addPool(address pool_address) external onlyOwner {
        require(bdstable_pools[pool_address] == false, "pool already exists");
        require(bdstable_pools_array.length < MAX_NUMBER_OF_POOLS, "pools limit reached");

        bdstable_pools[pool_address] = true; 
        bdstable_pools_array.push(payable(pool_address));

        emit PoolAdded(pool_address);
    }

    // Remove a pool 
    function removePool(address pool_address) external onlyOwner {
        require(bdstable_pools[pool_address] == true, "address doesn't exist already");
        
        delete bdstable_pools[pool_address];

        // bdstable_pools_array.length is limited by addPool function
        for (uint i = 0; i < bdstable_pools_array.length; i++){ 
            if (bdstable_pools_array[i] == pool_address) {
                bdstable_pools_array[i] = bdstable_pools_array[bdstable_pools_array.length -1];
                bdstable_pools_array.pop();
                break;
            }
        }

        emit PoolRemoved(pool_address);
    }

    function setBDStable_WETH_Oracle(address _bdstable_oracle_addr, address _weth_address) external onlyOwner {
        bdstableWethOracle = ICryptoPairOracle(_bdstable_oracle_addr); 
        weth_address = _weth_address;

        emit BDStableWETHOracleSet(_bdstable_oracle_addr, _weth_address);
    }

    function setBDX_WETH_Oracle(address _bdx_oracle_addr, address _weth_address) external onlyOwner {
        bdxWethOracle = ICryptoPairOracle(_bdx_oracle_addr);
        weth_address = _weth_address;

        emit BDXWETHOracleSet(_bdx_oracle_addr, _weth_address);
    }
    
    function setETH_fiat_Oracle(address _eth_fiat_consumer_address) external onlyOwner {
        weth_fiat_pricer = IOracleBasedCryptoFiatFeed(_eth_fiat_consumer_address);
        
        emit EthFiatOracleSet(_eth_fiat_consumer_address);
    }

    function setBdStable_step_d12(uint256 _bdStable_step_d12) external onlyOwner {
        bdStable_step_d12 = _bdStable_step_d12;

        emit BdStableStepSet(_bdStable_step_d12);
    }

    function set_price_target_d12(uint256 _price_target_d12) external onlyOwner {
        price_target_d12 = _price_target_d12;

        emit PriceTargetSet(_price_target_d12);
    }

    function set_price_band_d12(uint256 _price_band_d12) external onlyOwner {
        price_band_d12 = _price_band_d12;

        emit PriceBandSet(_price_band_d12);
    }

    function toggleCollateralRatioPaused() external onlyOwner {
        collateral_ratio_paused = !collateral_ratio_paused;

        emit CollateralRatioPausedToggled(collateral_ratio_paused);
    }

    function lockCollateralRatioAt(uint256 wantedCR_d12) external onlyOwner {
        require(wantedCR_d12 <= BdPoolLibrary.COLLATERAL_RATIO_MAX, "CR must be <0;1>");

        global_collateral_ratio_d12 = wantedCR_d12;
        collateral_ratio_paused = true;

        emit CollateralRatioLocked(wantedCR_d12);
    }

    function setTreasury_address(address _treasury_address) external onlyOwner {
        treasury_address = _treasury_address;
    }

    function setMinimumSwapsDelayInBlocks(uint256 _minimumMintRedeemDelayInBlocks) external onlyOwner{
        minimumMintRedeemDelayInBlocks = _minimumMintRedeemDelayInBlocks;
    }

    function pool_claim_bdx(uint256 amount) external onlyPools {
        unclaimedPoolsBDX = unclaimedPoolsBDX.add(amount);
    }

    function pool_transfer_claimed_bdx(address to, uint256 amount) external onlyPools {
        unclaimedPoolsBDX = unclaimedPoolsBDX.sub(amount);
        BDX.safeTransfer(to, amount);
    }

    function transfer_bdx(address to, uint256 BDX_amount) external onlyOwnerOrPool {
        require(
            BDX.balanceOf(address(this)).sub(unclaimedPoolsBDX) >= BDX_amount,
            "Not enough BDX"
        );

        BDX.safeTransfer(to, BDX_amount);
    }

    function transfer_bdx_force(address to, uint256 BDX_amount) external onlyOwner {
        BDX.safeTransfer(to, BDX_amount);
    }

    function burnFrom(address account, uint256 amount) public virtual {
        uint256 decreasedAllowance = allowance(account, _msgSender()).sub(amount, "ERC20: burn amount exceeds allowance");

        super._approve(account, _msgSender(), decreasedAllowance);
        super._burn(account, amount);
    }

    /* ========== EVENTS ========== */
    
    event CollateralRatioRefreshed(uint256 global_collateral_ratio);
    event BdStableBurned(address indexed from, address indexed to, uint256 amount);
    event BdStableMinted(address indexed from, address indexed to, uint256 amount);
    event PoolAdded(address pool_address);
    event PoolRemoved(address pool_address);
    event BDStableWETHOracleSet(address indexed bdstable_oracle_addr, address indexed weth_address);
    event BDXWETHOracleSet(address indexed bdx_oracle_address, address indexed weth_address);
    event EthFiatOracleSet(address eth_fiat_consumer_address);
    event BdStableStepSet(uint256 bdStable_step_d12);
    event PriceBandSet(uint256 _price_band_d12);
    event PriceTargetSet(uint256 _price_target_d12);
    event CollateralRatioPausedToggled(bool collateral_ratio_paused);
    event CollateralRatioLocked(uint256 lockedCR_d12);
}
