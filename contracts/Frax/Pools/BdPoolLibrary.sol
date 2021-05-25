// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;
pragma experimental ABIEncoderV2;

import "../../Math/SafeMath.sol";



library BdPoolLibrary {
    using SafeMath for uint256;

    // Constants for various precisions
    uint256 private constant PRICE_PRECISION = 1e12;


    struct MintFBD_Params {
        uint256 fxs_price_usd; 
        uint256 col_price_usd;
        uint256 fxs_amount;
        uint256 collateral_amount;
        uint256 col_ratio;
    }

    // ================ Functions ================

    function calcMint1t1BD(uint256 col_price, uint256 collateral_amount_d18) public pure returns (uint256) {
        return (collateral_amount_d18.mul(col_price)).div(1e12);
    }

    // function calcMintAlgorithmicFRAX(uint256 fxs_price_usd, uint256 fxs_amount_d18) public pure returns (uint256) {
    //     return fxs_amount_d18.mul(fxs_price_usd).div(1e12);
    // }

    // Must be internal because of the struct
    function calcMintFractionalBD(MintFBD_Params memory params) internal pure returns (uint256, uint256) {
        // Since solidity truncates division, every division operation must be the last operation in the equation to ensure minimum error
        // The contract must check the proper ratio was sent to mint FRAX. We do this by seeing the minimum mintable FRAX based on each amount 
        uint256 fxs_dollar_value_d18;
        uint256 c_dollar_value_d18;
        
        // Scoping for stack concerns
        {    
            // USD amounts of the collateral and the FXS
            fxs_dollar_value_d18 = params.fxs_amount.mul(params.fxs_price_usd).div(1e12);
            c_dollar_value_d18 = params.collateral_amount.mul(params.col_price_usd).div(1e12);

        }
        uint calculated_fxs_dollar_value_d18 = 
                    (c_dollar_value_d18.mul(1e12).div(params.col_ratio))
                    .sub(c_dollar_value_d18);

        uint calculated_fxs_needed = calculated_fxs_dollar_value_d18.mul(1e12).div(params.fxs_price_usd);

        return (
            c_dollar_value_d18.add(calculated_fxs_dollar_value_d18),
            calculated_fxs_needed
        );
    }

    function calcRedeem1t1BD(uint256 col_price, uint256 BD_amount) public pure returns (uint256) {
        return BD_amount.mul(1e12).div(col_price);
    }

    function calcMintAlgorithmicBD(uint256 bdx_price_usd, uint256 bdx_amount_d18) public pure returns (uint256) {
        return bdx_amount_d18.mul(bdx_price_usd).div(1e12);
    }

    // // Must be internal because of the struct
    // function calcBuyBackFXS(BuybackFXS_Params memory params) internal pure returns (uint256) {
    //     // If the total collateral value is higher than the amount required at the current collateral ratio then buy back up to the possible FXS with the desired collateral
    //     require(params.excess_collateral_dollar_value_d18 > 0, "No excess collateral to buy back!");

    //     // Make sure not to take more than is available
    //     uint256 fxs_dollar_value_d18 = params.FXS_amount.mul(params.fxs_price_usd).div(1e12);
    //     require(fxs_dollar_value_d18 <= params.excess_collateral_dollar_value_d18, "You are trying to buy back more than the excess!");

    //     // Get the equivalent amount of collateral based on the market value of FXS provided 
    //     uint256 collateral_equivalent_d18 = fxs_dollar_value_d18.mul(1e12).div(params.col_price_usd);
    //     //collateral_equivalent_d18 = collateral_equivalent_d18.sub((collateral_equivalent_d18.mul(params.buyback_fee)).div(1e12));

    //     return (
    //         collateral_equivalent_d18
    //     );

    // }


}