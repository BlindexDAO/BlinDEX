// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6 <=0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "./ICryptoPairOracle.sol";

// Fixed window oracle that recomputes the average price for the entire period once every period
// Note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract UniswapPairOracle is Ownable, ICryptoPairOracle {
    using FixedPoint for *;
    
    uint public period = 3600; // 1 hour TWAP (time-weighted average price)
    uint public consult_leniency = 120; // Used for being able to consult past the period end
    bool public allow_stale_consults = false; // If false, consult() will fail if the TWAP is stale

    IUniswapV2Pair public immutable pair;
    address public immutable token0;
    address public immutable token1;

    uint    public price0CumulativeLast;
    uint    public price1CumulativeLast;
    uint32  public blockTimestampLast;
    FixedPoint.uq112x112 public price0Average;
    FixedPoint.uq112x112 public price1Average;

    constructor(address factoryAddress, address tokenA, address tokenB) public {
        IUniswapV2Factory factory = IUniswapV2Factory(factoryAddress);

        IUniswapV2Pair _pair = IUniswapV2Pair(factory.getPair(tokenA, tokenB));
        pair = _pair;
        token0 = _pair.token0();
        token1 = _pair.token1();
    }

    function setPeriod(uint _period) external onlyOwner {
        period = _period;

        emit PeriodSet(_period);
    }

    function setConsultLeniency(uint _consult_leniency) external onlyOwner {
        consult_leniency = _consult_leniency;

        emit ConsultLatencySet(_consult_leniency);
    }

    function setAllowStaleConsults(bool _allow_stale_consults) external onlyOwner {
        allow_stale_consults = _allow_stale_consults;
    }

    function reset() external onlyOwner {
        price0CumulativeLast = pair.price0CumulativeLast(); // Fetch the current accumulated price value (1 / 0)
        price1CumulativeLast = pair.price1CumulativeLast(); // Fetch the current accumulated price value (0 / 1)
        uint112 reserve0;
        uint112 reserve1;

        (reserve0, reserve1, blockTimestampLast) = pair.getReserves();
        require(reserve0 != 0 && reserve1 != 0, "UniswapPairOracle: NO_RESERVES"); // Ensure that there's liquidity in the pair
    }

    // Check if updateOracle() can be called instead of wasting gas calling it
    function shouldUpdateOracle() override public view returns (bool) {
        uint32 blockTimestamp = UniswapV2OracleLibrary.currentBlockTimestamp();
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // Overflow is desired
        return (timeElapsed >= period);
    }

    function when_should_update_oracle_in_seconds() override external view returns (uint256){
        uint32 blockTimestamp = UniswapV2OracleLibrary.currentBlockTimestamp();
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // Overflow is desired

        if(timeElapsed >= period){
            return 0;
        }
        else{
            return period - timeElapsed;
        }
    }

    function updateOracle() override external {
        require(blockTimestampLast > 0, "Oracle not ready");

        (uint price0Cumulative, uint price1Cumulative, uint32 blockTimestamp) =
            UniswapV2OracleLibrary.currentCumulativePrices(address(pair));
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // Overflow is desired

        // Ensure that at least one full period has passed since the last update
        require(timeElapsed >= period || owner() == _msgSender(), "UniswapPairOracle: PERIOD_NOT_ELAPSED");

        // Overflow is desired, casting never truncates
        // Cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
        price0Average = FixedPoint.uq112x112(uint224((price0Cumulative - price0CumulativeLast) / timeElapsed));
        price1Average = FixedPoint.uq112x112(uint224((price1Cumulative - price1CumulativeLast) / timeElapsed));

        price0CumulativeLast = price0Cumulative;
        price1CumulativeLast = price1Cumulative;
        blockTimestampLast = blockTimestamp;
    }

    // Note this will always return 0 before update has been called successfully for the first time.
    function consult(address token, uint amountIn) override external view returns (uint amountOut) {
        uint32 blockTimestamp = UniswapV2OracleLibrary.currentBlockTimestamp();
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // Overflow is desired

        // Ensure that the price is not stale
        require((timeElapsed < (period + consult_leniency)) || allow_stale_consults, "UniswapPairOracle: PRICE_IS_STALE_NEED_TO_CALL_UPDATE");

        if (token == token0) {
            amountOut = price0Average.mul(amountIn).decode144();
        } else {
            require(token == token1, "UniswapPairOracle: INVALID_TOKEN");
            amountOut = price1Average.mul(amountIn).decode144();
        }
    }

    event PeriodSet(uint period);
    event ConsultLatencySet(uint consult_latency);
}
