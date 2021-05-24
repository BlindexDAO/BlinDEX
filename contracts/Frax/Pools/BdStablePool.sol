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

    uint256 public minting_fee;
    uint256 public redemption_fee;

    // Constants for various precisions
    uint256 private constant PRICE_PRECISION = 1e12;
    uint256 private constant COLLATERAL_RATIO_PRECISION = 1e12;
    uint256 private constant COLLATERAL_RATIO_MAX = 1e12;

    // Number of blocks to wait before being able to collectRedemption() - do we need that? hmmm
    uint256 public redemption_delay = 0; //1;

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
        missing_decimals = uint256(18).sub(collateral_token.decimals());
    }

    /* ========== VIEWS ========== */

    // Returns the value of excess collateral held in this Frax pool, compared to what is needed to maintain the global collateral ratio
    function availableExcessCollatDV() public view returns (uint256) {
        uint256 total_supply = BDSTABLE.totalSupply();
        uint256 global_collateral_ratio = BDSTABLE.global_collateral_ratio();
        uint256 global_collat_value = BDSTABLE.globalCollateralValue();

        if (global_collateral_ratio > COLLATERAL_RATIO_PRECISION)
            global_collateral_ratio = COLLATERAL_RATIO_PRECISION; // Handles an overcollateralized contract with CR > 1
        uint256 required_collat_dollar_value_d18 =
            (total_supply.mul(global_collateral_ratio)).div(
                COLLATERAL_RATIO_PRECISION
            ); // Calculates collateral needed to back each 1 FRAX with $1 of collateral at current collat ratio
        if (global_collat_value > required_collat_dollar_value_d18)
            return global_collat_value.sub(required_collat_dollar_value_d18);
        else return 0;
    }

    /* ========== PUBLIC FUNCTIONS ========== */

    // Returns the price of the pool collateral in USD
    function getCollateralPrice() public view returns (uint256) {
        // if(collateralPricePaused == true){
        //     return pausedPrice;
        // } else {
        uint256 eth_fiat_price = BDSTABLE.weth_fiat_price();
        uint256 collat_eth_price =
            collatWEthOracle.consult(
                weth_address,
                PRICE_PRECISION * (10**missing_decimals)
            );

        return eth_fiat_price.mul(PRICE_PRECISION).div(collat_eth_price);
        //}
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

        console.log("++++++++++++++++++++++++++");
        console.log(BDSTABLE.global_collateral_ratio());

        require(
            BDSTABLE.global_collateral_ratio() >= COLLATERAL_RATIO_MAX,
            "Collateral ratio must be >= 1"
        );
        // require(
        //     (collateral_token.balanceOf(address(this)))
        //         .sub(unclaimedPoolCollateral)
        //         .add(collateral_amount) <= pool_ceiling,
        //  "[Pool's Closed]: Ceiling reached"); //todo ag

        uint256 bd_amount_d18 =
            BdPoolLibrary.calcMint1t1BD(
                getCollateralPrice(),
                collateral_amount_d18
            ); //1 BD for each $1/€1/etc worth of collateral

        bd_amount_d18 = (bd_amount_d18.mul(uint256(1e12).sub(minting_fee))).div(1e12); //remove precision at the end
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
            collateral_needed.mul(uint256(1e12).sub(redemption_fee))
        ).div(1e12);

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

        redeemCollateralBalances[msg.sender] = redeemCollateralBalances[
            msg.sender
        ]
            .add(collateral_needed);
        unclaimedPoolCollateral = unclaimedPoolCollateral.add(
            collateral_needed
        );
        lastRedeemed[msg.sender] = block.number;

        // Move all external functions to the end
        BDSTABLE.pool_burn_from(msg.sender, BD_amount);
    }

    // After a redemption happens, transfer the newly minted BDX and owed collateral from this pool
    // contract to the user. Redemption is split into two functions to prevent flash loans from being able
    // to take out FRAX/collateral from the system, use an AMM to trade the new price, and then mint back into the system.
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

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setCollatWETHOracle(
        address _collateral_weth_oracle_address,
        address _weth_address //onlyByOwnerOrGovernance todo ag
    ) external {
        collat_weth_oracle_address = _collateral_weth_oracle_address;
        collatWEthOracle = IUniswapV2PairOracle(_collateral_weth_oracle_address);
        weth_address = _weth_address;
    }

    /* ========== EVENTS ========== */
}
