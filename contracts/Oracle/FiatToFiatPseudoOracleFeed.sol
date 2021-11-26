// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPriceFeed.sol";

// We need feeds with fiats prices. For now on RSK chain there are no such feeds.
// We populate our own feeds
contract FiatToFiatPseudoOracleFeed is IPriceFeed, Ownable {
    
    uint8 private constant DECIMALS = 12;
    uint256 private recentPrice = 1e12;
    
    uint256 public lastUpdateTimestamp;

    address private updater;

    constructor(address _updater) public {
        updater = _updater;
    }

    function decimals() external view override returns (uint8) {
        return DECIMALS;
    }

    function price() external view override returns (uint256) {
        return recentPrice;
    }

    function setUpdater(address newUpdater) external onlyOwner {
        address oldUpdater = updater;
        updater = newUpdater;
        emit UpdaterChanged(oldUpdater, updater);
    }

    function setPrice(uint256 _price) external onlyUpdater {
        recentPrice = _price;
        lastUpdateTimestamp = block.timestamp;
        emit PriceChanged(_price);
    }

    modifier onlyUpdater()
    {
        require(msg.sender == updater, "You're not updater");
        _;
    }

    event UpdaterChanged(address indexed oldUpdater, address indexed newUpdater);
    event PriceChanged(uint256 indexed newPrice);
}