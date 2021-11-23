// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../BdStable/BDStable.sol";
import "../../Oracle/ICryptoPairOracle.sol";
import "./BdPoolLibrary.sol";
import "../../ERC20/IWETH.sol";

contract BdStablePool is Initializable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    IERC20 private BDX;
    IWETH private NativeTokenWrapper;
    
    IERC20 public collateral_token;
    BDStable public BDSTABLE;
    ICryptoPairOracle public collatWEthOracle;
    
    bool public is_collateral_wrapping_native_token;

    address public owner_address;

    uint256 private missing_decimals; // Number of decimals needed to get to 18
    address private weth_address;

    mapping(address => uint256) public redeemBDXBalances;
    mapping(address => uint256) public redeemCollateralBalances;
    uint256 public unclaimedPoolCollateral;
    mapping(address => uint256) public lastRedeemed;

    // AccessControl state variables
    bool public mintPaused;
    bool public redeemPaused;
    bool public recollateralizePaused;
    bool public buyBackPaused;
    bool public collateralPricePaused;
    bool public recollateralizeOnlyForOwner;
    bool public buybackOnlyForOwner;

    uint256 public minting_fee; //d12
    uint256 public redemption_fee; //d12
    uint256 public buyback_fee; //d12
    uint256 public recollat_fee; //d12

    // Pool_ceiling is the total units of collateral that a pool contract can hold
    uint256 public pool_ceiling; // d18

    // Stores price of the collateral, if price is paused
    uint256 public pausedPrice;

    // Bonus rate on BDX minted during recollateralizeBdStable(); 12 decimals of precision, set to 0.75% on genesis
    uint256 public bonus_rate; // d12

    // Number of blocks to wait before being able to collectRedemption()
    uint256 public redemption_delay;

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

    function initialize(
        address _bdstable_contract_address,
        address _bdx_contract_address,
        address _collateral_address,
        uint256 _collateral_decimals,
        address _creator_address,
        bool _is_collateral_wrapping_native_token
    ) 
        public
        initializer
    {
        BDSTABLE = BDStable(_bdstable_contract_address);
        BDX = IERC20(_bdx_contract_address);
        if(_is_collateral_wrapping_native_token) {
            NativeTokenWrapper = IWETH(_collateral_address);
        }
        owner_address = _creator_address;
        collateral_token = IERC20(_collateral_address);
        missing_decimals = uint256(18).sub(_collateral_decimals);

        is_collateral_wrapping_native_token = _is_collateral_wrapping_native_token;

        pool_ceiling = 1e36; // d18
        bonus_rate = 7500000000; // d12 0.75%
        redemption_delay = 1;
        minting_fee = 3000000000; // d12 0.3%
        redemption_fee = 3000000000; // d12 0.3%

        recollateralizeOnlyForOwner = true;
        buybackOnlyForOwner = true;
    }

    /* ========== VIEWS ========== */

    // Returns the value of excess collateral held in all BdStablePool related to this BdStable, compared to what is needed to maintain the global collateral ratio
    function availableExcessCollatDV() public view returns (uint256) {
        uint256 total_supply = BDSTABLE.totalSupply();
        uint256 global_collateral_ratio_d12 = BDSTABLE.global_collateral_ratio_d12();
        uint256 global_collat_value = BDSTABLE.globalCollateralValue();

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

     // Returns the price of the pool collateral in fiat
    function getCollateralPrice_d12() public view returns (uint256) {
        if(collateralPricePaused == true){
            return pausedPrice;
        } else {
            uint256 eth_fiat_price_d12 = BDSTABLE.weth_fiat_price();
            uint256 collat_eth_price =
                collatWEthOracle.consult(
                    weth_address,
                    BdPoolLibrary.PRICE_PRECISION
                );

            return eth_fiat_price_d12.mul(BdPoolLibrary.PRICE_PRECISION).div(collat_eth_price);
        }
    }

    // Returns fiat value of collateral held in this BdStable pool
    function collatFiatBalance() public view returns (uint256) {
        //Expressed in collateral token decimals
        if(collateralPricePaused == true){
            return collateral_token.balanceOf(address(this))
                .sub(unclaimedPoolCollateral)
                .mul(10 ** missing_decimals)
                .mul(pausedPrice)
                .div(BdPoolLibrary.PRICE_PRECISION);
        } else {
            return collateral_token.balanceOf(address(this))
                .sub(unclaimedPoolCollateral)
                .mul(10 ** missing_decimals)
                .mul(getCollateralPrice_d12())
                .div(BdPoolLibrary.PRICE_PRECISION);
        }
    }

    /* ========== PUBLIC FUNCTIONS ========== */

    function updateOraclesIfNeeded() public {
        BDSTABLE.updateOraclesIfNeeded();
        if(collatWEthOracle.shouldUpdateOracle()){
            collatWEthOracle.updateOracle();
        }
    }

    // We separate out the 1t1, fractional and algorithmic minting functions for gas efficiency
    function mint1t1BD(uint256 collateral_amount, uint256 BD_out_min, bool useNativeToken)
        external
        payable
        notMintPaused
    {
        if(useNativeToken){
            require(is_collateral_wrapping_native_token, "Pool doesn't support native token");
            require(msg.value == collateral_amount, "msg.value and collateral_amount do not match");
        }

        updateOraclesIfNeeded();
        uint256 collateral_amount_d18 =
            collateral_amount * (10**missing_decimals);

        BDSTABLE.refreshCollateralRatio();
        uint256 globalCR = BDSTABLE.global_collateral_ratio_d12();

        require(
            globalCR == BdPoolLibrary.COLLATERAL_RATIO_MAX,
            "Collateral ratio must be == 1"
        );
        
        require(
            collateral_token.balanceOf(address(this))
                .sub(unclaimedPoolCollateral)
                .add(collateral_amount) <= pool_ceiling,
            "[Pool's Closed]: Ceiling reached"
        );

        uint256 bd_amount_d18 =
            BdPoolLibrary.calcMint1t1BD(
                getCollateralPrice_d12(),
                collateral_amount_d18
            ); //1 BD for each $1/€1/etc worth of collateral

        bd_amount_d18 = (bd_amount_d18.mul(uint256(BdPoolLibrary.PRICE_PRECISION).sub(minting_fee))).div(BdPoolLibrary.PRICE_PRECISION); //remove precision at the end
        require(BD_out_min <= bd_amount_d18, "Slippage limit reached");

        if(useNativeToken){
            NativeTokenWrapper.deposit{ value: collateral_amount }();
        } else {
            collateral_token.safeTransferFrom(
                msg.sender,
                address(this),
                collateral_amount
            );
        }

        BDSTABLE.pool_mint(msg.sender, bd_amount_d18);
    }

    // Redeem collateral. 100% collateral-backed
    function redeem1t1BD(uint256 BD_amount, uint256 COLLATERAL_out_min)
        external
        notRedeemPaused
    {
        updateOraclesIfNeeded();
        BDSTABLE.refreshCollateralRatio();

        require(
            BDSTABLE.global_collateral_ratio_d12() == BdPoolLibrary.COLLATERAL_RATIO_MAX,
            "Collateral ratio must be == 1"
        );

        // Need to adjust for decimals of collateral
        uint256 col_price_d12 = getCollateralPrice_d12();
        uint256 effective_collateral_ratio_d12 = BDSTABLE.effective_global_collateral_ratio_d12();
        uint256 cr_d12 = effective_collateral_ratio_d12 > BdPoolLibrary.COLLATERAL_RATIO_MAX ? BdPoolLibrary.COLLATERAL_RATIO_MAX : effective_collateral_ratio_d12;
        uint256 collateral_needed = BD_amount.mul(BdPoolLibrary.PRICE_PRECISION).mul(cr_d12).div(BdPoolLibrary.PRICE_PRECISION).div(col_price_d12);

        collateral_needed = (
            collateral_needed.mul(uint256(BdPoolLibrary.PRICE_PRECISION).sub(redemption_fee))
        ).div(BdPoolLibrary.PRICE_PRECISION);

        require(
            collateral_needed <=
                collateral_token.balanceOf(address(this)).sub(
                    unclaimedPoolCollateral
                ),
            "Not enough collateral in pool"
        );
        require(
            COLLATERAL_out_min <= collateral_needed,
            "Slippage limit reached"
        );

        require(BDSTABLE.canLegallyRedeem(msg.sender), "Cannot legally redeem");

        redeemCollateralBalances[msg.sender] = redeemCollateralBalances[msg.sender]
                .add(collateral_needed);
     

        unclaimedPoolCollateral = unclaimedPoolCollateral.add(collateral_needed);
        lastRedeemed[msg.sender] = block.number;

        // Move all external functions to the end
        BDSTABLE.pool_burn_from(msg.sender, BD_amount);
    }

    // 0% collateral-backed
    function mintAlgorithmicBdStable(uint256 bdx_amount_d18, uint256 bdStable_out_min) external notMintPaused {
        updateOraclesIfNeeded();
        BDSTABLE.refreshCollateralRatio();

        uint256 bdx_price = BDSTABLE.BDX_price_d12();
        require(BDSTABLE.global_collateral_ratio_d12() == 0, "Collateral ratio must be 0");

        (uint256 bdStable_amount_d18) = BdPoolLibrary.calcMintAlgorithmicBD(bdx_price, bdx_amount_d18);

        bdStable_amount_d18 = (bdStable_amount_d18.mul(uint(BdPoolLibrary.PRICE_PRECISION).sub(minting_fee))).div(BdPoolLibrary.PRICE_PRECISION);
        require(bdStable_out_min <= bdStable_amount_d18, "Slippage limit reached");

        BDX.safeTransferFrom(msg.sender, address(BDSTABLE), bdx_amount_d18);
        BDSTABLE.pool_mint(msg.sender, bdStable_amount_d18);
    }

    // Redeem BDSTABLE for BDX. 0% collateral-backed
    function redeemAlgorithmicBdStable(uint256 bdStable_amount, uint256 bdx_out_min) external notRedeemPaused {
        updateOraclesIfNeeded();
        BDSTABLE.refreshCollateralRatio();

        uint256 bdx_price = BDSTABLE.BDX_price_d12();
        uint256 global_collateral_ratio_d12 = BDSTABLE.global_collateral_ratio_d12();

        require(global_collateral_ratio_d12 == 0, "Collateral ratio must be 0"); 
        uint256 bdx_fiat_value_d18 = bdStable_amount;

        bdx_fiat_value_d18 = (bdx_fiat_value_d18.mul(uint(BdPoolLibrary.PRICE_PRECISION).sub(redemption_fee))).div(BdPoolLibrary.PRICE_PRECISION); //apply fees

        uint256 bdx_amount = bdx_fiat_value_d18.mul(BdPoolLibrary.PRICE_PRECISION).div(bdx_price);
        uint256 bdx_coverage_ratio = BDSTABLE.get_effective_bdx_coverage_ratio();
        bdx_amount = bdx_amount.mul(bdx_coverage_ratio).div(BdPoolLibrary.COLLATERAL_RATIO_PRECISION);
        
        require(bdx_out_min < bdx_amount, "Slippage limit reached");

        if(bdx_amount > 0){
            require(BDSTABLE.canLegallyRedeem(msg.sender), "Cannot legally redeem");
            
            redeemBDXBalances[msg.sender] = redeemBDXBalances[msg.sender].add(bdx_amount);

            BDSTABLE.pool_claim_bdx(bdx_amount);
        }
        
        lastRedeemed[msg.sender] = block.number;

        // Move all external functions to the end
        BDSTABLE.pool_burn_from(msg.sender, bdStable_amount);
    }

    // Will fail if fully collateralized or fully algorithmic
    // > 0% and < 100% collateral-backed
    function mintFractionalBdStable(uint256 collateral_amount, uint256 bdx_in_max, uint256 bdStable_out_min, bool useNativeToken)
        external
        payable
        notMintPaused
    {
        if(useNativeToken){
            require(is_collateral_wrapping_native_token, "Pool doesn't support native token");
            require(msg.value == collateral_amount, "msg.value and collateral_amount do not match");
        }

        updateOraclesIfNeeded();
        BDSTABLE.refreshCollateralRatio();

        uint256 bdx_price = BDSTABLE.BDX_price_d12();
        uint256 global_collateral_ratio_d12 = BDSTABLE.global_collateral_ratio_d12();

        require(global_collateral_ratio_d12 < BdPoolLibrary.COLLATERAL_RATIO_MAX && global_collateral_ratio_d12 > 0, 
            "Collateral ratio needs to be between .000001 and .999999");
        
        require(
            collateral_token.balanceOf(address(this))
                .sub(unclaimedPoolCollateral)
                .add(collateral_amount) <= pool_ceiling,
            "Pool ceiling reached, no more BdStable can be minted with this collateral"
        );

        uint256 collateral_amount_d18 = collateral_amount * (10 ** missing_decimals);

        (uint256 mint_amount, uint256 bdx_needed) = BdPoolLibrary.calcMintFractionalBD(
            bdx_price,
            getCollateralPrice_d12(),
            collateral_amount_d18,
            global_collateral_ratio_d12
        );

        mint_amount = (mint_amount.mul(uint(BdPoolLibrary.PRICE_PRECISION).sub(minting_fee))).div(BdPoolLibrary.PRICE_PRECISION);

        require(bdStable_out_min <= mint_amount, "Slippage limit reached");

        require(bdx_needed <= bdx_in_max, "Not enough BDX inputted");

        BDX.safeTransferFrom(msg.sender, address(BDSTABLE), bdx_needed);

        if(useNativeToken){
            NativeTokenWrapper.deposit{ value: collateral_amount }();
        } else {
            collateral_token.safeTransferFrom(msg.sender, address(this), collateral_amount);
        }

        BDSTABLE.pool_mint(msg.sender, mint_amount);
    }

    // Will fail if fully collateralized or algorithmic
    // Redeem BDSTABLE for collateral and BDX. > 0% and < 100% collateral-backed
    function redeemFractionalBdStable(uint256 BdStable_amount, uint256 BDX_out_min, uint256 COLLATERAL_out_min) external notRedeemPaused {
        updateOraclesIfNeeded();
        BDSTABLE.refreshCollateralRatio();

        uint256 global_collateral_ratio_d12 = BDSTABLE.global_collateral_ratio_d12();

        // due to introducing effective BDX coverage ratio, we allow for fractional redemption when CR=1
        // this doesn't make user suddenly loose value (all of the BDX porion) when efCR < 1 and CR moves form 0.9975 to 1
        require(global_collateral_ratio_d12 > 0, "Collateral ratio needs to be: > 0");

        uint256 effective_global_collateral_ratio_d12 = BDSTABLE.effective_global_collateral_ratio_d12();

        uint256 cr_d12 = effective_global_collateral_ratio_d12 < global_collateral_ratio_d12
            ? effective_global_collateral_ratio_d12
            : global_collateral_ratio_d12;

        uint256 BdStable_amount_post_fee = (BdStable_amount.mul(uint(BdPoolLibrary.PRICE_PRECISION).sub(redemption_fee))).div(BdPoolLibrary.PRICE_PRECISION);

        uint256 bdx_fiat_value_d18 = BdStable_amount_post_fee.sub(
                BdStable_amount_post_fee.mul(cr_d12).div(BdPoolLibrary.PRICE_PRECISION)
            );

        uint256 bdx_amount = bdx_fiat_value_d18.mul(BdPoolLibrary.PRICE_PRECISION).div(BDSTABLE.BDX_price_d12());
        uint256 bdx_coverage_ratio = BDSTABLE.get_effective_bdx_coverage_ratio();
        bdx_amount = bdx_amount.mul(bdx_coverage_ratio).div(BdPoolLibrary.COLLATERAL_RATIO_PRECISION);

        // Need to adjust for decimals of collateral
        uint256 BdStable_amount_precision = BdStable_amount_post_fee.div(10 ** missing_decimals);
        uint256 collateral_fiat_value = BdStable_amount_precision.mul(cr_d12).div(BdPoolLibrary.PRICE_PRECISION);
        uint256 collateral_needed = collateral_fiat_value.mul(BdPoolLibrary.PRICE_PRECISION).div(getCollateralPrice_d12());

        require(collateral_needed <= collateral_token.balanceOf(address(this)).sub(unclaimedPoolCollateral), "Not enough collateral in pool");
        require(COLLATERAL_out_min <= collateral_needed, "Slippage limit reached [collateral]");
        require(BDX_out_min <= bdx_amount, "Slippage limit reached [BDX]");

        require(BDSTABLE.canLegallyRedeem(msg.sender), "Cannot legally redeem");

        redeemCollateralBalances[msg.sender] = redeemCollateralBalances[msg.sender].add(collateral_needed);

        unclaimedPoolCollateral = unclaimedPoolCollateral.add(collateral_needed);

        if(bdx_amount > 0){
            require(BDSTABLE.canLegallyRedeem(msg.sender), "Cannot legally redeem");
            
            redeemBDXBalances[msg.sender] = redeemBDXBalances[msg.sender].add(bdx_amount);

            BDSTABLE.pool_claim_bdx(bdx_amount);
        }

        lastRedeemed[msg.sender] = block.number;
        
        // Move all external functions to the end
        BDSTABLE.pool_burn_from(msg.sender, BdStable_amount);
    }

    // After a redemption happens, transfer the newly minted BDX and owed collateral from this pool
    // contract to the user. Redemption is split into two functions to prevent flash loans from being able
    // to take out BdStable/collateral from the system, use an AMM to trade the new price, and then mint back into the system.
    function collectRedemption(bool useNativeToken)
        external
    {
        require(
            (lastRedeemed[msg.sender].add(redemption_delay)) <= block.number,
            "Must wait for redemption_delay blocks before collecting redemption"
        );
        bool sendBDX = false;
        bool sendCollateral = false;
        uint256 BDXAmount;
        uint256 CollateralAmount;

        // Use Checks-Effects-Interactions pattern
        if (redeemBDXBalances[msg.sender] > 0) {
            BDXAmount = redeemBDXBalances[msg.sender];
            redeemBDXBalances[msg.sender] = 0;

            sendBDX = true;
        }

        if (redeemCollateralBalances[msg.sender] > 0) {
            CollateralAmount = redeemCollateralBalances[msg.sender];
            redeemCollateralBalances[msg.sender] = 0;
            unclaimedPoolCollateral = unclaimedPoolCollateral.sub(
                CollateralAmount
            );

            sendCollateral = true;
        }

        if (sendBDX == true) {
            BDSTABLE.pool_transfer_claimed_bdx(msg.sender, BDXAmount);
        }
        if (sendCollateral == true) {
            if(useNativeToken){
                NativeTokenWrapper.withdraw(CollateralAmount);
                safeTransferETH(msg.sender, CollateralAmount);
            } else {
                collateral_token.safeTransfer(msg.sender, CollateralAmount);
            }
        }
    }

    // When the protocol is recollateralizing, we need to give a discount of BDX to hit the new CR target
    // Thus, if the target collateral ratio is higher than the actual value of collateral, minters get BDX for adding collateral
    // This function simply rewards anyone that sends collateral to a pool with the same amount of BDX + the bonus rate
    // Anyone can call this function to recollateralize the protocol and take the extra BDX value from the bonus rate as an arb opportunity
    function recollateralizeBdStable(uint256 collateral_amount, uint256 BDX_out_min, bool useNativeToken)
        external
        payable
    {
        require(recollateralizePaused == false, "Recollateralize is paused");

        if(recollateralizeOnlyForOwner){
            require(msg.sender == owner_address, "Currently only owner can recollateralize");
        }

        if(useNativeToken){
            require(is_collateral_wrapping_native_token, "Pool doesn't support native token");
            require(msg.value == collateral_amount, "msg.value and collateral_amount do not match");
        }

        updateOraclesIfNeeded();
        BDSTABLE.refreshCollateralRatio();

        uint256 collateral_amount_d18 = collateral_amount * (10 ** missing_decimals);
        uint256 bdx_price = BDSTABLE.BDX_price_d12();
        uint256 bdStable_total_supply = BDSTABLE.totalSupply();
        uint256 global_collateral_ratio_d12 = BDSTABLE.global_collateral_ratio_d12();
        uint256 global_collat_value = BDSTABLE.globalCollateralValue();

        (uint256 collateral_units, uint256 amount_to_recollat) = BdPoolLibrary.calcRecollateralizeBdStableInner(
            collateral_amount_d18,
            getCollateralPrice_d12(),
            global_collat_value,
            bdStable_total_supply,
            global_collateral_ratio_d12
        ); 

        uint256 collateral_units_precision = collateral_units.div(10 ** missing_decimals);

        uint256 bdx_paid_back = amount_to_recollat.mul(uint(BdPoolLibrary.PRICE_PRECISION).add(bonus_rate).sub(recollat_fee)).div(bdx_price);
        uint256 bdx_coverage_ratio = BDSTABLE.get_effective_bdx_coverage_ratio();
        bdx_paid_back = bdx_paid_back.mul(bdx_coverage_ratio).div(BdPoolLibrary.COLLATERAL_RATIO_PRECISION);

        require(BDX_out_min <= bdx_paid_back, "Slippage limit reached");

        if(useNativeToken){
            // no need to check collateral_units_precision, it's <= then collateral_amount

            NativeTokenWrapper.deposit{ value: collateral_units_precision }();

            // refund remaining native token, if any left
            if (msg.value > collateral_units_precision) {
                safeTransferETH(msg.sender, msg.value.sub(collateral_units_precision));
            }

        } else {
            collateral_token.safeTransferFrom(msg.sender, address(this), collateral_units_precision);
        }

        if(bdx_paid_back > 0){
            BDSTABLE.transfer_bdx(msg.sender, bdx_paid_back);
        }

        emit Recollateralized(collateral_units_precision, bdx_paid_back);
    }

    // Function can be called by an BDX holder to have the protocol buy back BDX with excess collateral value from a desired collateral pool
    // This can also happen if the collateral ratio > 1
    function buyBackBDX(uint256 BDX_amount, uint256 COLLATERAL_out_min, bool useNativeToken)
        external
    {
        require(buyBackPaused == false, "Buyback is paused");

        if(buybackOnlyForOwner){
            require(msg.sender == owner_address, "Currently only owner can buyback");
        }

        updateOraclesIfNeeded();
        
        uint256 bdx_price = BDSTABLE.BDX_price_d12();
    
        (uint256 collateral_equivalent_d18) = BdPoolLibrary.calcBuyBackBDX(
            availableExcessCollatDV(),
            bdx_price,
            getCollateralPrice_d12(),
            BDX_amount
        ).mul(uint(BdPoolLibrary.PRICE_PRECISION).sub(buyback_fee)).div(BdPoolLibrary.PRICE_PRECISION);

        uint256 collateral_precision = collateral_equivalent_d18.div(10 ** missing_decimals);

        require(COLLATERAL_out_min <= collateral_precision, "Slippage limit reached");
        
        // Take bdx form sender
        BDX.safeTransferFrom(msg.sender, address(BDSTABLE), BDX_amount);
        
        if(useNativeToken){
            // Give the sender their desired collateral
            NativeTokenWrapper.withdraw(collateral_precision);
            safeTransferETH(msg.sender, collateral_precision);
        }
        else {
            // Give the sender their desired collateral
            collateral_token.safeTransfer(msg.sender, collateral_precision);
        }
        emit BoughtBack(BDX_amount, collateral_precision);
    }

    receive() external payable {
        assert(msg.sender == address(NativeTokenWrapper)); // only accept ETH via fallback from the WETH contract
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setCollatWETHOracle(
        address _collateral_weth_oracle_address,
        address _weth_address
    ) 
        external
        onlyByOwner 
    {
        collatWEthOracle = ICryptoPairOracle(_collateral_weth_oracle_address);
        weth_address = _weth_address;

        emit CollateralWethOracleSet(_collateral_weth_oracle_address, _weth_address);
    }

    function toggleMintingPaused() external onlyByOwner {
        mintPaused = !mintPaused;

        emit MintingPausedToggled(mintPaused);
    }

    function toggleRedeemingPaused() external onlyByOwner {
        redeemPaused = !redeemPaused;

        emit RedeemingPausedToggled(redeemPaused);
    }

    function toggleRecollateralizePaused() external onlyByOwner {
        recollateralizePaused = !recollateralizePaused;

        emit RecollateralizePausedToggled(recollateralizePaused);
    }
    
    function toggleBuybackPaused() external onlyByOwner {
        buyBackPaused = !buyBackPaused;

        emit BuybackPausedToggled(buyBackPaused);
    }

    function toggleBuybackOnlyForOwner() external onlyByOwner {
        buybackOnlyForOwner = !buybackOnlyForOwner;

        emit BuybackOnlyForOwnerToggled(buybackOnlyForOwner);
    }

    function toggleRecollateralizeOnlyForOwner() external onlyByOwner {
        recollateralizeOnlyForOwner = !recollateralizeOnlyForOwner;

        emit RecollateralizeOnlyForOwnerToggled(recollateralizeOnlyForOwner);
    }

    function toggleCollateralPricePaused(uint256 _new_price) external onlyByOwner {
        // If pausing, set paused price; else if unpausing, clear pausedPrice
        if(collateralPricePaused == false){
            pausedPrice = _new_price;
        } else {
            pausedPrice = 0;
        }
        collateralPricePaused = !collateralPricePaused;

        emit CollateralPriceToggled(collateralPricePaused);
    }

    // Combined into one function due to 24KiB contract memory limit
    function setPoolParameters(
        uint256 new_ceiling, 
        uint256 new_bonus_rate, 
        uint256 new_redemption_delay, 
        uint256 new_mint_fee,
        uint256 new_redeem_fee, 
        uint256 new_buyback_fee,
        uint256 new_recollat_fee
    )
        external
        onlyByOwner 
    {
        pool_ceiling = new_ceiling;
        bonus_rate = new_bonus_rate;
        redemption_delay = new_redemption_delay;
        minting_fee = new_mint_fee;
        redemption_fee = new_redeem_fee;
        buyback_fee = new_buyback_fee;
        recollat_fee = new_recollat_fee;

        emit PoolParametersSet(new_ceiling, new_bonus_rate, new_redemption_delay, new_mint_fee, new_redeem_fee, new_buyback_fee, new_recollat_fee);
    }

    function setOwner(address _owner_address) external onlyByOwner {
        require(_owner_address != address(0), "New owner can't be zero address");

        owner_address = _owner_address;
        emit OwnerSet(_owner_address);
    }

    function safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "ETH transfer failed");
    }

    /* ========== EVENTS ========== */

    event OwnerSet(address indexed newOwner);
    event PoolParametersSet(uint256 new_ceiling, uint256 new_bonus_rate, uint256 new_redemption_delay, uint256 new_mint_fee, uint256 new_redeem_fee, uint256 new_buyback_fee, uint256 new_recollat_fee);
    event MintingPausedToggled(bool toggled);
    event RedeemingPausedToggled(bool toggled);
    event RecollateralizePausedToggled(bool toggled);
    event BuybackPausedToggled(bool toggled);
    event CollateralPriceToggled(bool toggled);
    event CollateralWethOracleSet(address indexed collateral_weth_oracle_address, address indexed weth_address);
    event RecollateralizeOnlyForOwnerToggled(bool recollateralizeOnlyForOwner);
    event BuybackOnlyForOwnerToggled(bool buybackOnlyForOwner);
    event Recollateralized(uint256 indexed collateral_amount_paid, uint256 indexed bdx_paid_back);
    event BoughtBack(uint256 indexed bdx_amount_paid, uint256 indexed collateral_paid_back);
}
