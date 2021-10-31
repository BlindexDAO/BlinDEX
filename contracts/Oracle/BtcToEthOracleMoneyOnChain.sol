// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IMoCBaseOracle.sol";
import "./ICryptoPairOracle.sol";

contract BtcToEthOracleMoneyOnChain is ICryptoPairOracle, Ownable {
    using SafeMath for uint256;

    IMoCBaseOracle internal feed;
    address internal wethAddress;
    
    uint8 private precision = 18;

    constructor(address _btcEthFeedAddress, address _wethAddress) public {
        feed = IMoCBaseOracle(_btcEthFeedAddress);
        wethAddress = _wethAddress;
    }

    function getPrice_1e12() public view returns (uint256) {       
        (bytes32 priceVal, bool isValid) = feed.peek();

        require(isValid, "Invalid price feed");

        return uint256(1e12)
            .mul(uint256(priceVal))
            .div(uint256(10)**precision);
    }

    function consult(address tokenIn, uint256 amountIn) external view override returns (uint256) {     
        require(tokenIn == wethAddress, "This oracle only accepts consulting WETH input");

        return amountIn.mul(1e12).div(getPrice_1e12());
    }

    function updateOracle() public override {}

    function shouldUpdateOracle() public view override returns (bool) {
        return false;
    }

    function when_should_update_oracle_in_seconds() public view override returns (uint256) {
        return 1e12;
    }

    function setPrecision(uint8 _precision) public onlyOwner {
        precision = _precision;
    }
}