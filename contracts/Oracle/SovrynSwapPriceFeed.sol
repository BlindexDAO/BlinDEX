// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPriceFeed.sol";
import "./ICryptoPairOracle.sol";
import "../Utils/Sovryn/ISovrynLiquidityPoolV1Converter.sol";
import "../Utils/Sovryn/ISovrynAnchor.sol";
import "../Utils/Sovryn/ISovrynSwapNetwork.sol";

// We need feeds with fiats prices. For now on RSK chain there are no such feeds.
// We populate our own feeds
contract SovrynSwapPriceFeed is IPriceFeed, ICryptoPairOracle, Ownable {
    using SafeMath for uint256;

    uint256 private constant PRECISION = 1e12;

    ISovrynSwapNetwork public sovrynNetwork;
    address public tokenSource;
    address public tokenTarget;
    uint256 public priceDisparityTolerance_d12;
    address public updater;
    uint256 public timeBeforeShouldUpdate;
    uint256 public timeBeforeMustUpdate;
    uint256 public updateTimestamp;
    uint256 public oraclePrice;

    constructor(
        address _sovrynNetworkAddress,
        address _tokenSource,
        address _tokenTarget,
        uint256 _priceDisparityTolerance_d12,
        address _updater,
        uint256 _timeBeforeShouldUpdate,
        uint256 _timeBeforeMustUpdate) public {

        require(_sovrynNetworkAddress != address(0), "SovrynNetwork address cannot be 0");
        require(_tokenSource != address(0), "TokenSource address cannot be 0");
        require(_tokenTarget != address(0), "TokenTarget address cannot be 0");
        require(_updater != address(0), "Updater address cannot be 0");
        require(_timeBeforeMustUpdate >= 60, "TimeBeforeMustUpdate must be at least 60 seconds");
        require(_timeBeforeShouldUpdate <= _timeBeforeMustUpdate, "TimeBeforeShouldUpdate must be <= timeBeforeMustUpdate");

        sovrynNetwork = ISovrynSwapNetwork(_sovrynNetworkAddress);
        tokenSource = _tokenSource;
        tokenTarget = _tokenTarget;
        priceDisparityTolerance_d12 = _priceDisparityTolerance_d12;
        updater = _updater;
        timeBeforeShouldUpdate = _timeBeforeShouldUpdate;
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

    function updateOracle() external override {
        revert("use updateOracleWithVerification() instead");
    }

    function shouldUpdateOracle() external view override returns (bool) {
        return false;
    }

    // Own methods

    function shouldUpdateOracleWithVerification() external view returns (bool) {
        return block.timestamp > updateTimestamp.add(timeBeforeShouldUpdate);
    }

    function updateOracleWithVerification(uint verificationPrice_d12) external onlyUpdater {
        address[] memory conversionPath = sovrynNetwork.conversionPath(tokenSource, tokenTarget);

        require(conversionPath.length == 3, "conversion path must be direct");
        ISovrynAnchor anchor = ISovrynAnchor(conversionPath[1]);
        ISovrynLiquidityPoolV1Converter sovrynConverter = ISovrynLiquidityPoolV1Converter(anchor.owner());

        (uint256 amountMinusFee, uint256 fee) = sovrynConverter.targetAmountAndFee(tokenSource, tokenTarget, PRECISION);
        uint256 newPrice = amountMinusFee.add(fee);
        uint256 priceDifference = verificationPrice_d12 > newPrice ? verificationPrice_d12.sub(newPrice) : newPrice.sub(verificationPrice_d12);
        require(priceDifference.mul(PRECISION).div(newPrice) < priceDisparityTolerance_d12, "Price disparity too big");
        oraclePrice = newPrice;
        updateTimestamp = block.timestamp;
        emit PriceChanged(oraclePrice);
    }

    // Setters

    function setTimeBeforeShouldUpdate(uint256 _timeBeforeShouldUpdate) public onlyOwner {
        require(_timeBeforeShouldUpdate <= timeBeforeMustUpdate, "TimeBeforeShouldUpdate must be <= timeBeforeMustUpdate");
        timeBeforeShouldUpdate = _timeBeforeShouldUpdate;
    }

    function setTimeBeforeMustUpdate(uint256 _timeBeforeMustUpdate) public onlyOwner {
        require(_timeBeforeMustUpdate >= 60, "TimeBeforeMustUpdate must be at least 60 seconds");
        timeBeforeMustUpdate = _timeBeforeMustUpdate;
    }

    function setPriceDisparityTolerance_d12(uint256 _priceDisparityTolerance_d12) external onlyOwner {
        priceDisparityTolerance_d12 = _priceDisparityTolerance_d12;
    }

    function setUpdater(address newUpdater) external onlyOwner {
        require(newUpdater != address(0), "Updater cannot be set to the zero address");
        
        address oldUpdater = updater;
        updater = newUpdater;
        emit UpdaterChanged(oldUpdater, updater);
    }

    modifier onlyUpdater()
    {
        require(msg.sender == updater, "You're not updater");
        _;
    }

    event UpdaterChanged(address indexed oldUpdater, address indexed newUpdater);
    event PriceChanged(uint256 indexed newPrice);
}