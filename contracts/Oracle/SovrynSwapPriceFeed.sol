// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./IPriceFeed.sol";
import "./ICryptoPairOracle.sol";
import "../Utils/Sovryn/ISovrynLiquidityPoolV1Converter.sol";

// We need feeds with fiats prices. For now on RSK chain there are no such feeds.
// We populate our own feeds
contract SovrynSwapPriceFeed is IPriceFeed, ICryptoPairOracle {
    using SafeMath for uint256;

    uint8 private constant DECIMALS = 12;
    uint256 private constant PRECISION = 1e12;

    ISovrynLiquidityPoolV1Converter public sovrynConverter;
    address public tokenSource;
    address public tokenTarget;

    constructor(address _sovrynConverterAddress, address _tokenSource, address _tokenTarget) public {
        sovrynConverter = ISovrynLiquidityPoolV1Converter(_sovrynConverterAddress);
        tokenSource = _tokenSource;
        tokenTarget = _tokenTarget;
    }

    // IPriceFeed

    function decimals() external view override returns (uint8) {
        return DECIMALS;
    }

    function price() external view override returns (uint256) {
        (uint256 amountMinusFee, uint256 fee) = sovrynConverter.targetAmountAndFee(tokenSource, tokenTarget, PRECISION);
        return amountMinusFee.add(fee);
    }

    // ICryptoPairOracle

    function consult(address tokenIn, uint256 amountIn) external view override returns (uint256) {     
        require(tokenIn == tokenSource, "This oracle only accepts consulting source token input");

        (uint256 amountMinusFee, uint256 fee) = sovrynConverter.targetAmountAndFee(tokenSource, tokenTarget, amountIn);
        return amountMinusFee.add(fee);
    }

    function updateOracle() public override {}

    function shouldUpdateOracle() public view override returns (bool) {
        return false;
    }

    function when_should_update_oracle_in_seconds() public view override returns (uint256) {
        return uint256(-1);
    }
}