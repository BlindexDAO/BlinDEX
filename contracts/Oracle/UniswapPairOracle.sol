// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

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

    uint8 private constant DECIMALS = 18;
    uint256 public period = 3600; // 1 hour TWAP (time-weighted average price)
    uint256 public consult_leniency = 60 * 15; // Used for being able to consult past the period end
    bool public allow_stale_consults = false; // If false, consult() will fail if the TWAP is stale

    IUniswapV2Pair public immutable pair;
    address public immutable token0;
    address public immutable token1;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint32 public blockTimestampLast;
    FixedPoint.uq112x112 public price0Average;
    FixedPoint.uq112x112 public price1Average;

    constructor(
        address factoryAddress,
        address tokenA,
        address tokenB
    ) public {
        require(factoryAddress != address(0), "Factory address cannot be 0");
        require(tokenA != address(0), "TokenA address cannot be 0");
        require(tokenB != address(0), "TokenB address cannot be 0");

        IUniswapV2Factory factory = IUniswapV2Factory(factoryAddress);

        IUniswapV2Pair _pair = IUniswapV2Pair(factory.getPair(tokenA, tokenB));
        pair = _pair;
        token0 = _pair.token0();
        token1 = _pair.token1();
    }

    function setPeriod(uint256 _period) external onlyOwner {
        period = _period;

        emit PeriodSet(_period);
    }

    function setConsultLeniency(uint256 _consult_leniency) external onlyOwner {
        consult_leniency = _consult_leniency;

        emit ConsultLeniencySet(_consult_leniency);
    }

    function setAllowStaleConsults(bool _allow_stale_consults) external onlyOwner {
        allow_stale_consults = _allow_stale_consults;

        emit AllowStaleConsultsSet(_allow_stale_consults);
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
    function shouldUpdateOracle() public view override returns (bool) {
        uint32 blockTimestamp = UniswapV2OracleLibrary.currentBlockTimestamp();
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // Overflow is desired
        return (timeElapsed >= period);
    }

    function updateOracle() external override {
        require(blockTimestampLast > 0, "Oracle not ready");

        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) = UniswapV2OracleLibrary.currentCumulativePrices(address(pair));
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
    function consult(address token, uint256 amountIn) external view override returns (uint256 amountOut) {
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

    function decimals() external view override returns (uint8) {
        return DECIMALS;
    }

    event PeriodSet(uint256 period);
    event ConsultLeniencySet(uint256 consult_latency);
    event AllowStaleConsultsSet(bool allow_stale_consults);
}
