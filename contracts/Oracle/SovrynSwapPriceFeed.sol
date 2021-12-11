// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPriceFeed.sol";
import "./ICryptoPairOracle.sol";
import "../Utils/Sovryn/ISovrynLiquidityPoolV1Converter.sol";

// We need feeds with fiats prices. For now on RSK chain there are no such feeds.
// We populate our own feeds
contract SovrynSwapPriceFeed is IPriceFeed, ICryptoPairOracle, Ownable {
    using SafeMath for uint256;

    uint256 private constant PRECISION = 1e12;

    ISovrynLiquidityPoolV1Converter public sovrynConverter;
    address public tokenSource;
    address public tokenTarget;
    uint256 public priceDisparityTolerance_d12;
    address public updater;
    uint256 public timeBeforeShouldUpdate;
    uint256 public timeBeforeMustUpdate;
    uint256 public updateTimestamp;
    uint256 public oraclePrice;

    constructor(address _sovrynConverterAddress,
        address _tokenSource,
        address _tokenTarget,
        uint256 _priceDisparityTolerance_d12,
        address _updater,
        uint256 _timeBeforeShouldUpdate,
        uint256 _timeBeforeMustUpdate) public {

        require(_sovrynConverterAddress != address(0), "SovrynConverter address cannot be 0");
        require(_tokenSource != address(0), "TokenSource address cannot be 0");
        require(_tokenTarget != address(0), "TokenTarget address cannot be 0");
        require(_updater != address(0), "Updater address cannot be 0");

        sovrynConverter = ISovrynLiquidityPoolV1Converter(_sovrynConverterAddress);
        tokenSource = _tokenSource;
        tokenTarget = _tokenTarget;
        priceDisparityTolerance_d12 = _priceDisparityTolerance_d12;
        updater = _updater;
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
        return 12;
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

    function updateOracle() external override {}

    function shouldUpdateOracle() external view override returns (bool) {
        return block.timestamp > updateTimestamp.add(timeBeforeShouldUpdate);
    }

    function when_should_update_oracle_in_seconds() external view override returns (uint256) {
        uint256 updateTime = updateTimestamp.add(timeBeforeShouldUpdate);
        return block.timestamp < updateTime ? updateTime.sub(block.timestamp) : 0;
    }

    // Own methods

    function updateOracleWithVerification(uint verificationPrice_d12) external onlyUpdater {
        (uint256 amountMinusFee, uint256 fee) = sovrynConverter.targetAmountAndFee(tokenSource, tokenTarget, PRECISION);
        uint256 newPrice = amountMinusFee.add(fee);
        uint256 priceDifference = verificationPrice_d12 > newPrice ? verificationPrice_d12.sub(newPrice) : newPrice.sub(verificationPrice_d12);
        require(priceDifference.mul(PRECISION).div(newPrice) < priceDisparityTolerance_d12, "Price disparity too big");
        oraclePrice = newPrice;
        updateTimestamp = block.timestamp;
        emit PriceChanged(oraclePrice);
    }

    function setUpdater(address newUpdater) external onlyOwner {
        require(newUpdater != address(0), "Updater cannot be set to the zero address");
        
        address oldUpdater = updater;
        updater = newUpdater;
        emit UpdaterChanged(oldUpdater, updater);
    }

    function setPriceDisparityTolerance_d12(uint256 _priceDisparityTolerance_d12) external onlyOwner {
        priceDisparityTolerance_d12 = _priceDisparityTolerance_d12;
    }

    modifier onlyUpdater()
    {
        require(msg.sender == updater, "You're not updater");
        _;
    }

    event UpdaterChanged(address indexed oldUpdater, address indexed newUpdater);
    event PriceChanged(uint256 indexed newPrice);
}