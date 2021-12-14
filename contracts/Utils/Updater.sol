// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "../Oracle/SovrynSwapPriceFeed.sol";
import "../Oracle/FiatToFiatPseudoOracleFeed.sol";
import "../Oracle/UniswapPairOracle.sol";
import "../BDStable/BDStable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Updater is Ownable {
    function update(
        address[] memory _sovrynOracles,
        uint256[] memory _sovrynPrices,
        address[] memory _fiatOracles,
        uint256[] memory _fiatPrices,
        address[] memory _uniswapOracles,
        address[] memory _BDStables
    ) external onlyUpdater {

        require(
            _sovrynOracles.length == _sovrynPrices.length,
            "Each sovryn oracle address needs its price"
        );
        require(
            _fiatOracles.length == _fiatPrices.length,
            "Each fiat oracle address needs its price"
        );

        for (uint256 i = 0; i < _sovrynOracles.length; i++) {
            SovrynSwapPriceFeed priceFeed = SovrynSwapPriceFeed(
                _sovrynOracles[i]
            );
            if (priceFeed.shouldUpdateOracle()) {
                priceFeed.updateOracleWithVerification(_sovrynPrices[i]);
            }
        }

        for (uint256 i = 0; i < _fiatOracles.length; i++) {
            FiatToFiatPseudoOracleFeed priceFeed = FiatToFiatPseudoOracleFeed(
                _fiatOracles[i]
            );
            priceFeed.setPrice(_fiatPrices[i]);
        }

        for (uint256 i = 0; i < _uniswapOracles.length; i++) {
            UniswapPairOracle priceFeed = UniswapPairOracle(_uniswapOracles[i]);
            if (priceFeed.shouldUpdateOracle()) {
                priceFeed.updateOracle();
            }
        }
        
        for (uint256 i = 0; i < _BDStables.length; i++) {
            BDStable priceFeed = BDStable(_BDStables[i]);
            priceFeed.refreshCollateralRatio();
        }
    }

    function setUpdater(address newUpdater) external onlyOwner {
        require(
            newUpdater != address(0),
            "Updater cannot be set to the zero address"
        );

        address oldUpdater = updater;
        updater = newUpdater;
        emit UpdaterChanged(oldUpdater, updater);
    }

    modifier onlyUpdater() {
        require(msg.sender == updater, "You're not updater");
        _;
    }
}
