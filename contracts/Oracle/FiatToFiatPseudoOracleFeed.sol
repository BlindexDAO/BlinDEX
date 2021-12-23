// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./IPriceFeed.sol";

// We need feeds with fiats prices. For now on RSK chain there are no such feeds.
// We populate our own feeds
contract FiatToFiatPseudoOracleFeed is IPriceFeed, Ownable {
    using SafeMath for uint256;

    uint8 private constant DECIMALS = 12;
    uint256 private constant PRICE_PRECISION = 1e12;
    uint256 private constant SECONDS_IN_DAY = 60 * 60 * 24;

    uint256 private recentPrice;
    uint256 public lastUpdateTimestamp;
    uint256 public maxDayChange_d12 = 1e10; // 1%

    address private updater;

    constructor(address _updater, uint256 _recentPrice) public {
        require(_updater != address(0), "Updater address cannot be 0");

        updater = _updater;
        recentPrice = _recentPrice;
        lastUpdateTimestamp = block.timestamp;
    }

    function decimals() external view override returns (uint8) {
        return DECIMALS;
    }

    function price() external view override returns (uint256) {
        return recentPrice;
    }

    function setUpdater(address newUpdater) external onlyOwner {
        require(newUpdater != address(0), "Updater cannot be set to the zero address");

        address oldUpdater = updater;
        updater = newUpdater;
        emit UpdaterChanged(oldUpdater, updater);
    }

    function setPrice(uint256 _price) external onlyUpdaterOrOwner {
        if (_msgSender() != owner()) {
            uint256 diff = _price > recentPrice ? _price.sub(recentPrice) : recentPrice.sub(_price);

            uint256 dayChange_d12 = PRICE_PRECISION.mul(diff).mul(SECONDS_IN_DAY).div(recentPrice).div(block.timestamp.sub(lastUpdateTimestamp));

            require(dayChange_d12 <= maxDayChange_d12, "Price change too big");
        }

        recentPrice = _price;
        lastUpdateTimestamp = block.timestamp;
        emit PriceChanged(_price);
    }

    function setMaxDayChange_d12(uint256 _maxDayChange_d12) external onlyOwner {
        maxDayChange_d12 = _maxDayChange_d12;
        emit MaxDayChangeChanged(_maxDayChange_d12);
    }

    modifier onlyUpdaterOrOwner() {
        require(_msgSender() == updater || _msgSender() == owner(), "You're not updater");
        _;
    }

    event UpdaterChanged(address indexed oldUpdater, address indexed newUpdater);
    event PriceChanged(uint256 indexed newPrice);
    event MaxDayChangeChanged(uint256 indexed newMaxDayChange_d12);
}
