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
import "../../Uniswap/Interfaces/IUniswapV2PairOracle.sol";
import "../../Governance/AccessControl.sol";
import "./BdPoolLibrary.sol";

import "hardhat/console.sol";

contract BdStablePool {
    using SafeMath for uint256;

    /* ========== STATE VARIABLES ========== */

    ERC20 public collateral_token;
    address private collateral_address;
    address private owner_address;

    address private bdstable_contract_address;
    address private bdx_contract_address;

    BDXShares private BDX;
    BDStable private BDSTABLE;

    IUniswapV2PairOracle private collatWEthOracle;
    address public collat_weth_oracle_address;
    // Number of decimals needed to get to 18
    uint256 private immutable missing_decimals;
    address private weth_address;

    mapping(address => uint256) public redeemBDXBalances;
    mapping(address => uint256) public redeemCollateralBalances;
    uint256 public unclaimedPoolCollateral;
    uint256 public unclaimedPoolBDX;
    mapping(address => uint256) public lastRedeemed;

    // Constants for various precisions
    uint256 private constant PRICE_PRECISION = 1e12;
    uint256 private constant COLLATERAL_RATIO_PRECISION = 1e12;
    uint256 private constant COLLATERAL_RATIO_MAX = 1e12;

    // AccessControl state variables
    bool public mintPaused = false;
    bool public redeemPaused = false;
    bool public recollateralizePaused = false;
    bool public buyBackPaused = false;
    bool public collateralPricePaused = false;

    uint256 public minting_fee; //d12
    uint256 public redemption_fee; //d12
    uint256 public buyback_fee; //d12
    uint256 public recollat_fee; //d12

    // Pool_ceiling is the total units of collateral that a pool contract can hold
    uint256 public pool_ceiling = 1e36; // d18

    // Stores price of the collateral, if price is paused
    uint256 public pausedPrice = 0;

    // Bonus rate on FXS minted during recollateralizeFRAX(); 12 decimals of precision, set to 0.75% on genesis
    uint256 public bonus_rate = 7500000000; // d12

    // Number of blocks to wait before being able to collectRedemption()
    uint256 public redemption_delay = 1;

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
        missing_decimals = uint256(18).sub(collateral_token.decimals());
    }

    /* ========== VIEWS ========== */

    //todo ag
    // Returns dollar value of collateral held in this Frax pool
    // function collatDollarBalance() public view returns (uint256) {
    //     if(collateralPricePaused == true){
    //         return (collateral_token.balanceOf(address(this)).sub(unclaimedPoolCollateral)).mul(10 ** missing_decimals).mul(pausedPrice).div(PRICE_PRECISION);
    //     } else {
    //         uint256 eth_usd_price = FRAX.eth_usd_price();
    //         uint256 eth_collat_price = collatEthOracle.consult(weth_address, (PRICE_PRECISION * (10 ** missing_decimals)));

    //         uint256 collat_usd_price = eth_usd_price.mul(PRICE_PRECISION).div(eth_collat_price);
    //         return (collateral_token.balanceOf(address(this)).sub(unclaimedPoolCollateral)).mul(10 ** missing_decimals).mul(collat_usd_price).div(PRICE_PRECISION); //.mul(getCollateralPrice()).div(1e6);    
    //     }
    // }

    // Returns the value of excess collateral held in this BdStable pool, compared to what is needed to maintain the global collateral ratio
    function availableExcessCollatDV() public view returns (uint256) {
        uint256 total_supply = BDSTABLE.totalSupply();
        uint256 global_collateral_ratio = BDSTABLE.global_collateral_ratio();
        uint256 global_collat_value = BDSTABLE.globalCollateralValue();

        if (global_collateral_ratio > COLLATERAL_RATIO_PRECISION)
            global_collateral_ratio = COLLATERAL_RATIO_PRECISION; // Handles an overcollateralized contract with CR > 1
        uint256 required_collat_dollar_value_d18 =
            (total_supply.mul(global_collateral_ratio)).div(
                COLLATERAL_RATIO_PRECISION
            ); // Calculates collateral needed to back each 1 BdStable with $1 of collateral at current collat ratio
        if (global_collat_value > required_collat_dollar_value_d18)
            return global_collat_value.sub(required_collat_dollar_value_d18);
        else return 0;
    }

    /* ========== PUBLIC FUNCTIONS ========== */

    // Returns the price of the pool collateral in fiat
    function getCollateralPrice() public view returns (uint256) {
        if(collateralPricePaused == true){
            return pausedPrice;
        } else {
            uint256 eth_fiat_price = BDSTABLE.weth_fiat_price();
            uint256 collat_eth_price =
                collatWEthOracle.consult(
                    weth_address,
                    PRICE_PRECISION * (10**missing_decimals)
                );

            return eth_fiat_price.mul(PRICE_PRECISION).div(collat_eth_price);
        }
    }

    // Returns fiat value of collateral held in this Frax pool
    function collatFiatBalance() public view returns (uint256) {
        //Expressed in collateral token decimals
        // if(collateralPricePaused == true){
        //     return (collateral_token.balanceOf(address(this)).sub(unclaimedPoolCollateral)).mul(10 ** missing_decimals).mul(pausedPrice).div(PRICE_PRECISION);
        // } else { //todo lw
        uint256 eth_fiat_price = BDSTABLE.weth_fiat_price();
        uint256 eth_collat_price =
            collatWEthOracle.consult(
                weth_address,
                (PRICE_PRECISION * (10**missing_decimals))
            );

        uint256 collat_usd_price =
            eth_fiat_price.mul(PRICE_PRECISION).div(eth_collat_price);
        return
            (
                collateral_token.balanceOf(address(this)).sub(
                    unclaimedPoolCollateral
                )
            )
                .mul(10**missing_decimals)
                .mul(collat_usd_price)
                .div(PRICE_PRECISION); //.mul(getCollateralPrice()).div(1e12);//todo lw
        //}
    }

    // We separate out the 1t1, fractional and algorithmic minting functions for gas efficiency
    function mint1t1BD(uint256 collateral_amount, uint256 BD_out_min)
        external
        notMintPaused
    {
        uint256 collateral_amount_d18 =
            collateral_amount * (10**missing_decimals);

        require(
            BDSTABLE.global_collateral_ratio() >= COLLATERAL_RATIO_MAX,
            "Collateral ratio must be >= 1"
        );
        // require(
        //     (collateral_token.balanceOf(address(this)))
        //         .sub(unclaimedPoolCollateral)
        //         .add(collateral_amount) <= pool_ceiling,
        //  "[Pool's Closed]: Ceiling reached"); //todo lw

        uint256 bd_amount_d18 =
            BdPoolLibrary.calcMint1t1BD(
                getCollateralPrice(),
                collateral_amount_d18
            ); //1 BD for each $1/€1/etc worth of collateral

        bd_amount_d18 = (bd_amount_d18.mul(uint256(PRICE_PRECISION).sub(minting_fee))).div(PRICE_PRECISION); //remove precision at the end
        require(BD_out_min <= bd_amount_d18, "Slippage limit reached");

        collateral_token.transferFrom(
            msg.sender,
            address(this),
            collateral_amount
        );
        BDSTABLE.pool_mint(msg.sender, bd_amount_d18);
    }

    // Redeem collateral. 100% collateral-backed
    function redeem1t1BD(uint256 BD_amount, uint256 COLLATERAL_out_min)
        external
        notRedeemPaused
    {
        require(
            BDSTABLE.global_collateral_ratio() == COLLATERAL_RATIO_MAX,
            "Collateral ratio must be == 1"
        );

        // Need to adjust for decimals of collateral
        uint256 BD_amount_precision = BD_amount.div(10**missing_decimals);
        uint256 collateral_needed =
            BdPoolLibrary.calcRedeem1t1BD(
                getCollateralPrice(),
                BD_amount_precision
            );

        collateral_needed = (
            collateral_needed.mul(uint256(PRICE_PRECISION).sub(redemption_fee))
        ).div(PRICE_PRECISION);

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

        redeemCollateralBalances[msg.sender] = redeemCollateralBalances[msg.sender]
            .add(collateral_needed);

        unclaimedPoolCollateral = unclaimedPoolCollateral.add(
            collateral_needed
        );
        lastRedeemed[msg.sender] = block.number;

        // Move all external functions to the end
        BDSTABLE.pool_burn_from(msg.sender, BD_amount);
    }

    // 0% collateral-backed
    function mintAlgorithmicBdStable(uint256 bdx_amount_d18, uint256 bdStable_out_min) external notMintPaused {
        uint256 bdx_price = BDSTABLE.BDX_price_d12();
        require(BDSTABLE.global_collateral_ratio() == 0, "Collateral ratio must be 0");

        (uint256 bdStable_amount_d18) = BdPoolLibrary.calcMintAlgorithmicBD(bdx_price, bdx_amount_d18);

        bdStable_amount_d18 = (bdStable_amount_d18.mul(uint(PRICE_PRECISION).sub(minting_fee))).div(PRICE_PRECISION);
        require(bdStable_out_min <= bdStable_amount_d18, "Slippage limit reached");

        BDX.pool_burn_from(msg.sender, bdx_amount_d18);
        BDSTABLE.pool_mint(msg.sender, bdStable_amount_d18);
    }

    // Redeem BDSTABLE for BDX. 0% collateral-backed
    function redeemAlgorithmicBdStable(uint256 bdStable_amount, uint256 bdx_out_min) external notRedeemPaused {
        uint256 bdx_price = BDSTABLE.BDX_price_d12();
        uint256 global_collateral_ratio = BDSTABLE.global_collateral_ratio();

        require(global_collateral_ratio == 0, "Collateral ratio must be 0"); 
        uint256 bdx_dollar_value_d18 = bdStable_amount;

        bdx_dollar_value_d18 = (bdx_dollar_value_d18.mul(uint(PRICE_PRECISION).sub(redemption_fee))).div(PRICE_PRECISION); //apply fees

        uint256 bdx_amount = bdx_dollar_value_d18.mul(PRICE_PRECISION).div(bdx_price);
        
        redeemBDXBalances[msg.sender] = redeemBDXBalances[msg.sender].add(bdx_amount);
        unclaimedPoolBDX = unclaimedPoolBDX.add(bdx_amount);
        
        lastRedeemed[msg.sender] = block.number;
        
        require(bdx_out_min <= bdx_amount, "Slippage limit reached");
        // Move all external functions to the end
        BDSTABLE.pool_burn_from(msg.sender, bdStable_amount);
        BDX.pool_mint(address(this), bdx_amount);
    }

    // Will fail if fully collateralized or fully algorithmic
    // > 0% and < 100% collateral-backed
    function mintFractionalBdStable(uint256 collateral_amount, uint256 bdx_amount, uint256 bdStable_out_min) external notMintPaused {
        uint256 bdx_price = BDSTABLE.BDX_price_d12();
        uint256 global_collateral_ratio = BDSTABLE.global_collateral_ratio();

        require(global_collateral_ratio < COLLATERAL_RATIO_MAX && global_collateral_ratio > 0, 
            "Collateral ratio needs to be between .000001 and .999999");
        require(collateral_token
            .balanceOf(address(this))
            .sub(unclaimedPoolCollateral)
            .add(collateral_amount) <= pool_ceiling,
            "Pool ceiling reached, no more BdStable can be minted with this collateral");

        uint256 collateral_amount_d18 = collateral_amount * (10 ** missing_decimals);
        BdPoolLibrary.MintFBD_Params memory input_params = BdPoolLibrary.MintFBD_Params(
            bdx_price,
            getCollateralPrice(),
            bdx_amount,
            collateral_amount_d18,
            global_collateral_ratio
        );

        (uint256 mint_amount, uint256 bdx_needed) = BdPoolLibrary.calcMintFractionalBD(input_params);

        mint_amount = (mint_amount.mul(uint(PRICE_PRECISION).sub(minting_fee))).div(PRICE_PRECISION);

        require(bdStable_out_min <= mint_amount, "Slippage limit reached");

        require(bdx_needed <= bdx_amount, "Not enough BDX inputted");

        BDX.pool_burn_from(msg.sender, bdx_needed);
        collateral_token.transferFrom(msg.sender, address(this), collateral_amount);
        BDSTABLE.pool_mint(msg.sender, mint_amount);
    }

    // Will fail if fully collateralized or algorithmic
    // Redeem BDSTABLE for collateral and FXS. > 0% and < 100% collateral-backed
    function redeemFractionalBdStable(uint256 BdStable_amount, uint256 BDX_out_min, uint256 COLLATERAL_out_min) external notRedeemPaused {
        uint256 bdx_price = BDSTABLE.BDX_price_d12();
        uint256 global_collateral_ratio = BDSTABLE.global_collateral_ratio();

        require(global_collateral_ratio < COLLATERAL_RATIO_MAX && global_collateral_ratio > 0, "Collateral ratio needs to be between .000001 and .999999");
        uint256 col_price_fiat = getCollateralPrice();

        uint256 BdStable_amount_post_fee = (BdStable_amount.mul(uint(PRICE_PRECISION).sub(redemption_fee))).div(PRICE_PRECISION);

        uint256 bdx_fiat_value_d18 = BdStable_amount_post_fee.sub(BdStable_amount_post_fee.mul(global_collateral_ratio).div(PRICE_PRECISION));
        uint256 bdx_amount = bdx_fiat_value_d18.mul(PRICE_PRECISION).div(bdx_price);

        // Need to adjust for decimals of collateral
        uint256 BdStable_amount_precision = BdStable_amount_post_fee.div(10 ** missing_decimals);
        uint256 collateral_fiat_value = BdStable_amount_precision.mul(global_collateral_ratio).div(PRICE_PRECISION);
        uint256 collateral_amount = collateral_fiat_value.mul(PRICE_PRECISION).div(col_price_fiat);

        require(collateral_amount <= collateral_token.balanceOf(address(this)).sub(unclaimedPoolCollateral), "Not enough collateral in pool");
        require(COLLATERAL_out_min <= collateral_amount, "Slippage limit reached [collateral]");
        require(BDX_out_min <= bdx_amount, "Slippage limit reached [FXS]");

        redeemCollateralBalances[msg.sender] = redeemCollateralBalances[msg.sender].add(collateral_amount);
        unclaimedPoolCollateral = unclaimedPoolCollateral.add(collateral_amount);

        redeemBDXBalances[msg.sender] = redeemBDXBalances[msg.sender].add(bdx_amount);
        unclaimedPoolBDX = unclaimedPoolBDX.add(bdx_amount);

        lastRedeemed[msg.sender] = block.number;
        
        // Move all external functions to the end
        BDSTABLE.pool_burn_from(msg.sender, BdStable_amount);
        BDX.pool_mint(address(this), bdx_amount);
    }

    // After a redemption happens, transfer the newly minted BDX and owed collateral from this pool
    // contract to the user. Redemption is split into two functions to prevent flash loans from being able
    // to take out BdStable/collateral from the system, use an AMM to trade the new price, and then mint back into the system.
    function collectRedemption() external {
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
            unclaimedPoolBDX = unclaimedPoolBDX.sub(BDXAmount);

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
            BDX.transfer(msg.sender, BDXAmount);
        }
        if (sendCollateral == true) {
            collateral_token.transfer(msg.sender, CollateralAmount);
        }
    }

    // todo ag replace with 1to1, fractional and algorythmic variants form frax
    // We separate out the 1t1, fractional and algorithmic minting functions for gas efficiency
    function mintBdStable(uint256 collateral_amount) external notMintPaused {
        // collateral_token.transferFrom(msg.sender, address(this), collateral_amount); // todo lr
        uint256 bdstable_amount = collateral_amount;
        BDSTABLE.pool_mint(msg.sender, bdstable_amount);
    }

    // todo ag
    // When the protocol is recollateralizing, we need to give a discount of FXS to hit the new CR target
    // Thus, if the target collateral ratio is higher than the actual value of collateral, minters get FXS for adding collateral
    // This function simply rewards anyone that sends collateral to a pool with the same amount of FXS + the bonus rate
    // Anyone can call this function to recollateralize the protocol and take the extra FXS value from the bonus rate as an arb opportunity
    // function recollateralizeFRAX(uint256 collateral_amount, uint256 FXS_out_min) external {
    //     require(recollateralizePaused == false, "Recollateralize is paused");
    //     uint256 collateral_amount_d18 = collateral_amount * (10 ** missing_decimals);
    //     uint256 fxs_price = FRAX.fxs_price();
    //     uint256 frax_total_supply = FRAX.totalSupply();
    //     uint256 global_collateral_ratio = FRAX.global_collateral_ratio();
    //     uint256 global_collat_value = FRAX.globalCollateralValue();

    //     (uint256 collateral_units, uint256 amount_to_recollat) = FraxPoolLibrary.calcRecollateralizeFRAXInner(
    //         collateral_amount_d18,
    //         getCollateralPrice(),
    //         global_collat_value,
    //         frax_total_supply,
    //         global_collateral_ratio
    //     ); 

    //     uint256 collateral_units_precision = collateral_units.div(10 ** missing_decimals);

    //     uint256 fxs_paid_back = amount_to_recollat.mul(uint(1e6).add(bonus_rate).sub(recollat_fee)).div(fxs_price);

    //     require(FXS_out_min <= fxs_paid_back, "Slippage limit reached");
    //     collateral_token.transferFrom(msg.sender, address(this), collateral_units_precision);
    //     FXS.pool_mint(msg.sender, fxs_paid_back);
        
    // }

    // todo ag
    // Function can be called by an FXS holder to have the protocol buy back FXS with excess collateral value from a desired collateral pool
    // This can also happen if the collateral ratio > 1
    // function buyBackFXS(uint256 FXS_amount, uint256 COLLATERAL_out_min) external {
    //     require(buyBackPaused == false, "Buyback is paused");
    //     uint256 fxs_price = FRAX.fxs_price();
    
    //     FraxPoolLibrary.BuybackFXS_Params memory input_params = FraxPoolLibrary.BuybackFXS_Params(
    //         availableExcessCollatDV(),
    //         fxs_price,
    //         getCollateralPrice(),
    //         FXS_amount
    //     );

    //     (uint256 collateral_equivalent_d18) = (FraxPoolLibrary.calcBuyBackFXS(input_params)).mul(uint(1e6).sub(buyback_fee)).div(1e6);
    //     uint256 collateral_precision = collateral_equivalent_d18.div(10 ** missing_decimals);

    //     require(COLLATERAL_out_min <= collateral_precision, "Slippage limit reached");
    //     // Give the sender their desired collateral and burn the FXS
    //     FXS.pool_burn_from(msg.sender, FXS_amount);
    //     collateral_token.transfer(msg.sender, collateral_precision);
    // }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setCollatWETHOracle(
        address _collateral_weth_oracle_address,
        address _weth_address
    ) 
        external
        onlyByOwner 
    {
        collat_weth_oracle_address = _collateral_weth_oracle_address;
        collatWEthOracle = IUniswapV2PairOracle(_collateral_weth_oracle_address);
        weth_address = _weth_address;
    }

    function toggleMinting() external onlyByOwner {
        mintPaused = !mintPaused;
    }

    function toggleRedeeming() external onlyByOwner {
        redeemPaused = !redeemPaused;
    }

    function toggleRecollateralize() external onlyByOwner {
        recollateralizePaused = !recollateralizePaused;
    }
    
    function toggleBuyBack() external onlyByOwner {
        buyBackPaused = !buyBackPaused;
    }

    function toggleCollateralPrice(uint256 _new_price) external onlyByOwner {
        // If pausing, set paused price; else if unpausing, clear pausedPrice
        if(collateralPricePaused == false){
            pausedPrice = _new_price;
        } else {
            pausedPrice = 0;
        }
        collateralPricePaused = !collateralPricePaused;
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
    }

    function setOwner(address _owner_address) external onlyByOwner {
        owner_address = _owner_address;
    }

    /* ========== EVENTS ========== */
}
