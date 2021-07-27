// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;
pragma experimental ABIEncoderV2;

import "../../Math/SafeMath.sol";

library BdPoolLibrary {
    using SafeMath for uint256;

    // Constants for various precisions
    uint256 private constant PRICE_PRECISION = 1e12;

    struct MintFBD_Params {
        uint256 bdx_price_fiat_d12; 
        uint256 col_price_fiat_d12;
        uint256 bdx_amount_d18;
        uint256 collateral_amount_d18;
        uint256 col_ratio_d12;
    }

    struct BuybackBDX_Params {
        uint256 excess_collateral_fiat_value_d18;
        uint256 bdx_price_fiat_d12;
        uint256 col_price_fiat_d12;
        uint256 bdx_amount_d18;
    }

    // ================ Functions ================

    function calcMint1t1BD(uint256 col_price, uint256 collateral_amount_d18) public pure returns (uint256) {
        return (collateral_amount_d18.mul(col_price)).div(1e12);
    }

    // Must be internal because of the struct
    function calcMintFractionalBD(MintFBD_Params memory params) internal pure returns (uint256, uint256) {
        // Since solidity truncates division, every division operation must be the last operation in the equation to ensure minimum error
        // The contract must check the proper ratio was sent to mint BdStable. We do this by seeing the minimum mintable BdStable based on each amount 
        uint256 bdx_fiat_value_d18;
        uint256 c_fiat_value_d18;
        
        // Scoping for stack concerns
        {    
            // fiat amounts of the collateral and the BDX
            bdx_fiat_value_d18 = params.bdx_amount_d18.mul(params.bdx_price_fiat_d12).div(1e12);
            c_fiat_value_d18 = params.collateral_amount_d18.mul(params.col_price_fiat_d12).div(1e12);
        }

        uint calculated_bdx_fiat_value_d18 = 
                    (c_fiat_value_d18.mul(1e12).div(params.col_ratio_d12))
                    .sub(c_fiat_value_d18);

        uint calculated_bdx_needed = calculated_bdx_fiat_value_d18.mul(1e12).div(params.bdx_price_fiat_d12);

        return (
            c_fiat_value_d18.add(calculated_bdx_fiat_value_d18),
            calculated_bdx_needed
        );
    }

    function calcMintAlgorithmicBD(uint256 bdx_price_fiat_d12, uint256 bdx_amount_d18_d18) public pure returns (uint256) {
        return bdx_amount_d18_d18.mul(bdx_price_fiat_d12).div(1e12);
    }

    function calcRecollateralizeBdStableInner(
        uint256 collateral_amount_d18, 
        uint256 col_price,
        uint256 global_collat_value,
        uint256 bdStable_total_supply,
        uint256 global_collateral_ratio
    ) public pure returns (uint256, uint256) {
        uint256 collat_value_attempted = collateral_amount_d18.mul(col_price).div(1e12);
        uint256 effective_collateral_ratio = global_collat_value.mul(1e12).div(bdStable_total_supply); //returns it in 1e12
        uint256 recollat_possible = (global_collateral_ratio.mul(bdStable_total_supply).sub(bdStable_total_supply.mul(effective_collateral_ratio))).div(1e12);

        uint256 amount_to_recollat;
        if(collat_value_attempted <= recollat_possible){
            amount_to_recollat = collat_value_attempted;
        } else {
            amount_to_recollat = recollat_possible;
        }

        return (amount_to_recollat.mul(1e12).div(col_price), amount_to_recollat);
    }

    // Must be internal because of the struct
    function calcBuyBackBDX(BuybackBDX_Params memory params) internal pure returns (uint256) {
        // If the total collateral value is higher than the amount required at the current collateral ratio then buy back up to the possible BDX with the desired collateral
        require(params.excess_collateral_fiat_value_d18 > 0, "No excess collateral to buy back!");

        // Make sure not to take more than is available
        uint256 bdx_fiat_value_d18 = params.bdx_amount_d18.mul(params.bdx_price_fiat_d12).div(1e12);
        require(bdx_fiat_value_d18 <= params.excess_collateral_fiat_value_d18, "You are trying to buy back more than the excess!");

        // Get the equivalent amount of collateral based on the market value of BDX provided 
        uint256 collateral_equivalent_d18 = bdx_fiat_value_d18.mul(1e12).div(params.col_price_fiat_d12);

        return (
            collateral_equivalent_d18
        );
    }


}