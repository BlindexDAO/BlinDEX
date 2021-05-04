// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;


import './Interfaces/IUniswapV2Pair.sol';
import './UniswapV2ERC20.sol';
import '../Math/Math.sol';
import '../Math/UQ112x112.sol';
import '../Math/FixedPoint.sol';
import '../ERC20/IERC20.sol';
import './Interfaces/IUniswapV2Factory.sol';
import './Interfaces/IUniswapV2Callee.sol';
import './Interfaces/IUniswapV2PairOracle.sol';
import './UniswapV2OracleLibrary.sol';
import './UniswapV2PairOriginal.sol';

import "hardhat/console.sol";

contract UniswapV2Pair is UniswapV2PairOriginal, IUniswapV2PairOracle {
    using FixedPoint for *;
    using SafeMath  for uint;
    using UQ112x112 for uint224;

    uint public PERIOD = 3600; // 1 hour TWAP (time-weighted average price)
    uint public CONSULT_LENIENCY = 120; // Used for being able to consult past the period end
    bool public ALLOW_STALE_CONSULTS = false; // If false, consult() will fail if the TWAP is stale
    FixedPoint.uq112x112 public price0AverageOracle;
    FixedPoint.uq112x112 public price1AverageOracle;
    uint    public price0CumulativeLastOracle;
    uint    public price1CumulativeLastOracle;
    uint32  public blockTimestampLastOracle;

    address owner_address;
    address timelock_address;

    constructor(address _owner_address) UniswapV2PairOriginal() public {
        owner_address = _owner_address;
    }

    // update reserves and, on the first call per block, price accumulators
    function _update(uint balance0, uint balance1, uint112 _reserve0, uint112 _reserve1) override internal {
        super._update(balance0, balance1, _reserve0, _reserve1);

        updateOracle();   
    }

    function setOwner_sddress(address _owner_address) external onlyByOwnerOrGovernance {
        owner_address = _owner_address;
    }

    function setPeriod(uint _period) external onlyByOwnerOrGovernance {
        PERIOD = _period;
    }

    function setConsultLeniency(uint _consult_leniency) external onlyByOwnerOrGovernance {
        CONSULT_LENIENCY = _consult_leniency;
    }

    function setAllowStaleConsults(bool _allow_stale_consults) external onlyByOwnerOrGovernance {
        ALLOW_STALE_CONSULTS = _allow_stale_consults;
    }

    function updateOracle() public {
        uint32 blockTimestamp = UniswapV2OracleLibrary.currentBlockTimestamp();
        uint32 timeElapsed = blockTimestamp - blockTimestampLastOracle; // Overflow is desired
        if(timeElapsed >= PERIOD) {
            uint price0Cumulative = price0CumulativeLast;
            uint price1Cumulative = price1CumulativeLast;

            if (blockTimestampLast != blockTimestamp) {
                // subtraction overflow is desired
                uint32 timeElapsed = blockTimestamp - blockTimestampLast;
                // addition overflow is desired
                // counterfactual
                price0Cumulative += uint(FixedPoint.fraction(reserve1, reserve0)._x) * timeElapsed;
                // counterfactual
                price1Cumulative += uint(FixedPoint.fraction(reserve0, reserve1)._x) * timeElapsed;
            }

            price0AverageOracle = FixedPoint.uq112x112(uint224((price0Cumulative - price0CumulativeLastOracle) / timeElapsed));
            price1AverageOracle = FixedPoint.uq112x112(uint224((price1Cumulative - price1CumulativeLastOracle) / timeElapsed));

            price0CumulativeLastOracle = price0Cumulative;
            price1CumulativeLastOracle = price1Cumulative;
            blockTimestampLastOracle = blockTimestamp;
        }
    }

    // Note this will always return 0 before update has been called successfully for the first time.
    function consult(address token, uint amountIn) external view override returns (uint amountOut) {
        
        uint32 blockTimestamp = UniswapV2OracleLibrary.currentBlockTimestamp();
        uint32 timeElapsed = blockTimestamp - blockTimestampLastOracle; // Overflow is desired
        
        // Ensure that the price is not stale
        require((timeElapsed < (PERIOD + CONSULT_LENIENCY)) || ALLOW_STALE_CONSULTS, 'UniswapPairOracle: PRICE_IS_STALE_NEED_TO_CALL_UPDATE');

        if (token == token0) {
            amountOut = price0AverageOracle.mul(amountIn).decode144();
        } else {
            require(token == token1, 'UniswapPairOracle: INVALID_TOKEN');
            amountOut = price1AverageOracle.mul(amountIn).decode144();
        }
    }

    modifier onlyByOwnerOrGovernance() {
        require(msg.sender == owner_address || msg.sender == timelock_address, "You are not an owner or the governance timelock");
        _;
    }
}