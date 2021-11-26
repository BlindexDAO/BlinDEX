// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";

library BdPoolLibrary {
    using SafeMath for uint256;

    // Constants for various precisions
    uint256 public constant PRICE_PRECISION = 1e12;
    uint256 public constant COLLATERAL_RATIO_PRECISION = 1e12;
    uint256 public constant COLLATERAL_RATIO_MAX = 1e12;

    // ================ Functions ================

    function calcMint1t1BD(uint256 col_price, uint256 collateral_amount_d18) external pure returns (uint256) {
        return (collateral_amount_d18.mul(col_price)).div(PRICE_PRECISION);
    }

    // Must be internal because of the struct
    function calcMintFractionalBD(uint256 bdx_price_fiat_d12, uint256 col_price_fiat_d12, uint256 collateral_amount_d18, uint256 col_ratio_d12) internal pure returns (uint256, uint256) {
        // Since solidity truncates division, every division operation must be the last operation in the equation to ensure minimum error
        // The contract must check the proper ratio was sent to mint BdStable. We do this by seeing the minimum mintable BdStable based on each amount 

        uint256 c_fiat_value_d18 = collateral_amount_d18.mul(col_price_fiat_d12).div(PRICE_PRECISION);
        
        uint calculated_bdx_fiat_value_d18 = 
                    (c_fiat_value_d18.mul(COLLATERAL_RATIO_PRECISION).div(col_ratio_d12))
                    .sub(c_fiat_value_d18);

        uint calculated_bdx_needed = calculated_bdx_fiat_value_d18.mul(PRICE_PRECISION).div(bdx_price_fiat_d12);

        return (
            c_fiat_value_d18.add(calculated_bdx_fiat_value_d18),
            calculated_bdx_needed
        );
    }

    function calcMintAlgorithmicBD(uint256 bdx_price_fiat_d12, uint256 bdx_amount_d18) external pure returns (uint256) {
        return bdx_amount_d18.mul(bdx_price_fiat_d12).div(PRICE_PRECISION);
    }

    function calcRecollateralizeBdStableInner(
        uint256 collateral_amount_d18,
        uint256 col_price,
        uint256 global_collat_value,
        uint256 bdStable_total_supply,
        uint256 global_collateral_ratio
    ) external pure returns (uint256, uint256) {
        uint256 collat_value_attempted = collateral_amount_d18.mul(col_price).div(PRICE_PRECISION);
        uint256 effective_collateral_ratio = global_collat_value.mul(PRICE_PRECISION).div(bdStable_total_supply); //returns it in 1e12
        uint256 recollat_possible = global_collateral_ratio.sub(effective_collateral_ratio).mul(bdStable_total_supply).div(COLLATERAL_RATIO_PRECISION);

        uint256 amount_to_recollat;
        if(collat_value_attempted <= recollat_possible){
            amount_to_recollat = collat_value_attempted;
        } else {
            amount_to_recollat = recollat_possible;
        }

        return (amount_to_recollat.mul(PRICE_PRECISION).div(col_price), amount_to_recollat);
    }

    // Must be internal because of the struct
    function calcBuyBackBDX(uint256 excess_collateral_fiat_value_d18, uint256 bdx_price_fiat_d12, uint256 col_price_fiat_d12, uint256 bdx_amount_d18) internal pure returns (uint256) {
        // If the total collateral value is higher than the amount required at the current collateral ratio then buy back up to the possible BDX with the desired collateral
        require(excess_collateral_fiat_value_d18 > 0, "No excess collateral to buy back!");

        // Make sure not to take more than is available
        uint256 bdx_fiat_value_d18 = bdx_amount_d18.mul(bdx_price_fiat_d12).div(PRICE_PRECISION);
        require(bdx_fiat_value_d18 <= excess_collateral_fiat_value_d18, "You are trying to buy back more than the excess!");

        // Get the equivalent amount of collateral based on the market value of BDX provided 
        uint256 collateral_equivalent_d18 = bdx_fiat_value_d18.mul(PRICE_PRECISION).div(col_price_fiat_d12);

        return (
            collateral_equivalent_d18
        );
    }
}