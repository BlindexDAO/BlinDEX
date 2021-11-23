// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPriceFeed.sol";
import "./ICryptoPairOracle.sol";
import "../Utils/Sovryn/ISovrynLiquidityPoolV1Converter.sol";

// We need feeds with fiats prices. For now on RSK chain there are no such feeds.
// We populate our own feeds
contract SovrynSwapPriceFeed is IPriceFeed, ICryptoPairOracle, Ownable {
    using SafeMath for uint256;

    uint8 private constant DECIMALS = 12;
    uint256 private constant PRECISION = 1e12;
    uint256 private constant PRICE_DISPARITY_TOLERANCE_d12 = 5e10; //5% difference allowed

    ISovrynLiquidityPoolV1Converter public sovrynConverter;
    address public tokenSource;
    address public tokenTarget;
    uint256 private timeBeforeShouldUpdate;
    uint256 private timeBeforeMustUpdate;
    uint256 private updateTimestamp;
    uint256 private oraclePrice;

    constructor(address _sovrynConverterAddress,
        address _tokenSource,
        address _tokenTarget,
        uint256 _timeBeforeShouldUpdate,
        uint256 _timeBeforeMustUpdate) public {
        sovrynConverter = ISovrynLiquidityPoolV1Converter(_sovrynConverterAddress);
        tokenSource = _tokenSource;
        tokenTarget = _tokenTarget;
        timeBeforeShouldUpdate = _timeBeforeShouldUpdate;
        timeBeforeMustUpdate = _timeBeforeMustUpdate;
    }

    // Setters

    function setTimeBeforeShouldUpdate(uint256 _timeBeforeShouldUpdate) public onlyOwner {
        timeBeforeShouldUpdate = _timeBeforeShouldUpdate;
    }

    function setTimeBeforeMustUpdate(uint256 _timeBeforeMustUpdate) public onlyOwner {
        timeBeforeMustUpdate = _timeBeforeMustUpdate;
    }

    // IPriceFeed

    function decimals() external view override returns (uint8) {
        return DECIMALS;
    }

    function price() external view override returns (uint256) {
        require(oraclePrice != 0, "Oracle not yet initiated");
        require(block.timestamp < updateTimestamp.add(timeBeforeMustUpdate), "Price is stale. Update oracle");
        return oraclePrice;
    }

    // ICryptoPairOracle

    function consult(address tokenIn, uint256 amountIn) external view override returns (uint256) {     
        require(tokenIn == tokenSource, "This oracle only accepts consulting source token input");
        require(oraclePrice != 0, "Oracle not yet initiated");
        require(block.timestamp < updateTimestamp.add(timeBeforeMustUpdate), "Price is stale. Update oracle");
        return oraclePrice.mul(amountIn).div(PRECISION);
    }

    function updateOracle() public override {}

    function updateOracleWithVerificatoin(uint verificationPrice_d12) public onlyOwner {
        (uint256 amountMinusFee, uint256 fee) = sovrynConverter.targetAmountAndFee(tokenSource, tokenTarget, PRECISION);
        uint256 priceDifference = verificationPrice_d12 > amountMinusFee ? verificationPrice_d12.sub(amountMinusFee) : amountMinusFee.sub(verificationPrice_d12);
        require(priceDifference.div(amountMinusFee).mul(PRECISION) < PRICE_DISPARITY_TOLERANCE_d12, "Price disparity too big");
        oraclePrice = amountMinusFee.add(fee);
        updateTimestamp = block.timestamp;
    }

    function shouldUpdateOracle() public view override returns (bool) {
        return block.timestamp > updateTimestamp.add(timeBeforeShouldUpdate);
    }

    function when_should_update_oracle_in_seconds() public view override returns (uint256) {
        uint256 updateTime = updateTimestamp.add(timeBeforeShouldUpdate);
        return block.timestamp < updateTime ? updateTime.sub(block.timestamp) : 0;
    }
}