pragma solidity 0.6.11;

import "./AggregatorV3Interface.sol";
import "../Math/SafeMath.sol";
import "../Math/MagnitudesAndPowers.sol";
import "hardhat/console.sol";

contract ChainlinkBasedCryptoFiatFeed {
    using SafeMath for uint256;

    AggregatorV3Interface internal fiatToUsdFeed;
    AggregatorV3Interface internal cryptoToUsdFeed;
    
    constructor(address _fiatToUsdFeedAddress, address _cryptUsdFeedAddress) public {
        fiatToUsdFeed = AggregatorV3Interface(_fiatToUsdFeedAddress);
        cryptoToUsdFeed = AggregatorV3Interface(_cryptUsdFeedAddress);
    }

    function getPrice_1e12() public view returns (uint256) {       
        uint256 fiatUsdPrice = getLatestPrice(fiatToUsdFeed);
        uint256 cryptoUsdPrice = getLatestPrice(cryptoToUsdFeed);
        console.log("fiatUsdPrice");
        console.log(fiatUsdPrice);
        console.log("cryptoUsdPrice");
        console.log(cryptoUsdPrice);

        return uint256(1e12)
            .mul(cryptoUsdPrice)
            .mul(uint256(10)**fiatToUsdFeed.decimals())
            .div(fiatUsdPrice)
            .div(uint256(10)**cryptoToUsdFeed.decimals());
    }
    function consult(address token, uint amountIn) external view returns (uint256) {     
        //require(token == WETH); // todo lw
        console.log("Price fiat");
        console.log(getPrice_1e12());
        return getPrice_1e12().mul(amountIn);
    }

    function getLatestPrice(AggregatorV3Interface feed) internal view returns (uint256) {
        (
            , 
            int256 price,
            ,
            ,
            
        ) = feed.latestRoundData();
        return uint256(price);
    }
    function getDecimals()  public view returns (uint8) {
        return 12 + fiatToUsdFeed.decimals() - cryptoToUsdFeed.decimals();
    }
}