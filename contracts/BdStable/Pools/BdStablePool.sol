// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../../BdStable/BDStable.sol";
import "../../Oracle/ICryptoPairOracle.sol";
import "./BdPoolLibrary.sol";
import "../../Utils/IWETH.sol";

contract BdStablePool is OwnableUpgradeable {
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    IERC20 private BDX;
    IWETH private NativeTokenWrapper;

    IERC20 public collateral_token;
    BDStable public BDSTABLE;
    ICryptoPairOracle public collatWEthOracle;

    bool public is_collateral_wrapping_native_token;

    uint256 private missing_decimals; // Number of decimals needed to get to 18
    address private weth_address;

    mapping(address => uint256) public redeemBDXBalances;
    mapping(address => uint256) public redeemCollateralBalances;
    uint256 public unclaimedPoolCollateral;
    mapping(address => uint256) public lastRedeemed;

    // AccessControl state variables
    bool public mintPaused;
    bool public redeemPaused;
    bool public recollateralizePaused;
    bool public buyBackPaused;
    bool public collateralPricePaused;
    bool public recollateralizeOnlyForOwner;
    bool public buybackOnlyForOwner;

    uint256 public minting_fee; //d12
    uint256 public redemption_fee; //d12
    uint256 public buyback_fee; //d12
    uint256 public recollat_fee; //d12

    // Pool_ceiling is the total units of collateral that a pool contract can hold
    uint256 public pool_ceiling; // d18

    // Stores price of the collateral, if price is paused
    uint256 public pausedPrice;

    // Bonus rate on BDX minted during recollateralizeBdStable(); 12 decimals of precision, set to 0.75% on genesis
    uint256 public bonus_rate; // d12

    // Number of blocks to wait before being able to collectRedemption()
    uint256 public redemption_delay;

    /* ========== MODIFIERS ========== */

    modifier notRedeemPaused() {
        require(redeemPaused == false, "Redeeming is paused");
        _;
    }

    modifier notMintPaused() {
        require(mintPaused == false, "Minting is paused");
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    function initialize(
        address _bdstable_contract_address,
        address _bdx_contract_address,
        address _collateral_address,
        uint256 _collateral_decimals,
        bool _is_collateral_wrapping_native_token
    ) external initializer {
        require(_bdstable_contract_address != address(0), "BdStable address cannot be 0");
        require(_bdx_contract_address != address(0), "BDX address cannot be 0");
        require(_collateral_address != address(0), "Collateral address cannot be 0");

        __Ownable_init();

        BDSTABLE = BDStable(_bdstable_contract_address);
        BDX = IERC20(_bdx_contract_address);
        if (_is_collateral_wrapping_native_token) {
            NativeTokenWrapper = IWETH(_collateral_address);
        }
        collateral_token = IERC20(_collateral_address);
        missing_decimals = uint256(18) - _collateral_decimals;

        is_collateral_wrapping_native_token = _is_collateral_wrapping_native_token;

        pool_ceiling = 1e36; // d18
        bonus_rate = 7500000000; // d12 0.75%
        redemption_delay = 1;
        minting_fee = 3000000000; // d12 0.3%
        redemption_fee = 3000000000; // d12 0.3%

        recollateralizeOnlyForOwner = false;
        buybackOnlyForOwner = true;
    }

    /* ========== VIEWS ========== */

    // Returns the price of the pool collateral in fiat
    function getCollateralPrice_d12() public view returns (uint256) {
        if (collateralPricePaused == true) {
            return pausedPrice;
        } else {
            uint256 eth_fiat_price_d12 = BDSTABLE.weth_fiat_price();
            uint256 collat_eth_price = collatWEthOracle.consult(weth_address, BdPoolLibrary.PRICE_PRECISION);

            return (eth_fiat_price_d12 * BdPoolLibrary.PRICE_PRECISION) / collat_eth_price;
        }
    }

    // Returns fiat value of collateral held in this BdStable pool
    function collatFiatBalance() external view returns (uint256) {
        //Expressed in collateral token decimals
        if (collateralPricePaused == true) {
            return
                ((collateral_token.balanceOf(address(this)) - unclaimedPoolCollateral) * (10**missing_decimals) * pausedPrice) /
                BdPoolLibrary.PRICE_PRECISION;
        } else {
            return
                ((collateral_token.balanceOf(address(this)) - unclaimedPoolCollateral) * (10**missing_decimals) * getCollateralPrice_d12()) /
                BdPoolLibrary.PRICE_PRECISION;
        }
    }

    /* ========== PUBLIC FUNCTIONS ========== */

    function updateOraclesIfNeeded() public {
        BDSTABLE.updateOraclesIfNeeded();
        if (collatWEthOracle.shouldUpdateOracle()) {
            collatWEthOracle.updateOracle();
        }
    }

    // Will fail if fully collateralized or fully algorithmic
    // > 0% and < 100% collateral-backed
    function mintFractionalBdStable(
        uint256 collateral_amount_in_max,
        uint256 bdx_in_max,
        uint256 bdStable_out_min,
        bool useNativeToken
    ) external payable notMintPaused {
        if (useNativeToken) {
            require(is_collateral_wrapping_native_token, "Pool doesn't support native token");
            require(msg.value == collateral_amount_in_max, "msg.value and collateral_amount_in_max do not match");
        }

        updateOraclesIfNeeded();
        uint256 bdx_price = BDSTABLE.BDX_price_d12();
        uint256 global_collateral_ratio_d12 = BDSTABLE.global_collateral_ratio_d12();

        if (global_collateral_ratio_d12 == 0) {
            collateral_amount_in_max = 0;
        } else if (global_collateral_ratio_d12 == BdPoolLibrary.COLLATERAL_RATIO_MAX) {
            bdx_in_max = 0;
        }

        require(
            (collateral_token.balanceOf(address(this)) - unclaimedPoolCollateral + collateral_amount_in_max) <= pool_ceiling,
            "Pool ceiling reached, no more BdStable can be minted with this collateral"
        );

        uint256 collateral_amount_in_max_d18 = collateral_amount_in_max * (10**missing_decimals);

        uint256 mint_amount;
        uint256 bdx_needed;
        if (global_collateral_ratio_d12 == 0) {
            mint_amount = BdPoolLibrary.calcMintAlgorithmicBD(bdx_price, bdx_in_max);
            bdx_needed = bdx_in_max;
        } else if (global_collateral_ratio_d12 == 1) {
            mint_amount = BdPoolLibrary.calcMint1t1BD(getCollateralPrice_d12(), collateral_amount_in_max_d18);
            bdx_needed = 0;
        } else {
            (mint_amount, bdx_needed) = BdPoolLibrary.calcMintFractionalBD(
                bdx_price,
                getCollateralPrice_d12(),
                collateral_amount_in_max_d18,
                global_collateral_ratio_d12
            );
        }

        mint_amount = (mint_amount * (uint256(BdPoolLibrary.PRICE_PRECISION) - minting_fee)) / BdPoolLibrary.PRICE_PRECISION;

        require(bdStable_out_min <= mint_amount, "Slippage limit reached");
        require(bdx_needed <= bdx_in_max, "Not enough BDX inputted");

        BDSTABLE.refreshCollateralRatio();

        if (bdx_needed > 0) {
            BDX.safeTransferFrom(msg.sender, address(BDSTABLE), bdx_needed);
        }

        if (collateral_amount_in_max > 0) {
            if (useNativeToken) {
                NativeTokenWrapper.deposit{value: collateral_amount_in_max}();
            } else {
                collateral_token.safeTransferFrom(msg.sender, address(this), collateral_amount_in_max);
            }
        }

        BDSTABLE.pool_mint(msg.sender, mint_amount);
    }

    // Will fail if fully collateralized or algorithmic
    // Redeem BDSTABLE for collateral and BDX. > 0% and < 100% collateral-backed
    function redeemFractionalBdStable(
        uint256 BdStable_amount,
        uint256 BDX_out_min,
        uint256 COLLATERAL_out_min
    ) external notRedeemPaused {
        updateOraclesIfNeeded();
        uint256 global_collateral_ratio_d12 = BDSTABLE.global_collateral_ratio_d12();
        uint256 effective_global_collateral_ratio_d12 = BDSTABLE.effective_global_collateral_ratio_d12();

        uint256 cr_d12 = effective_global_collateral_ratio_d12 < global_collateral_ratio_d12
            ? effective_global_collateral_ratio_d12
            : global_collateral_ratio_d12;

        uint256 BdStable_amount_post_fee = (BdStable_amount * (uint256(BdPoolLibrary.PRICE_PRECISION) - redemption_fee)) /
            BdPoolLibrary.PRICE_PRECISION;

        uint256 bdx_fiat_value_d18 = BdStable_amount_post_fee - ((BdStable_amount_post_fee * cr_d12) / BdPoolLibrary.PRICE_PRECISION);

        uint256 bdx_amount = (bdx_fiat_value_d18 * BdPoolLibrary.PRICE_PRECISION) / BDSTABLE.BDX_price_d12();
        uint256 bdx_coverage_ratio = BDSTABLE.get_effective_bdx_coverage_ratio();
        bdx_amount = (bdx_amount * bdx_coverage_ratio) / BdPoolLibrary.COLLATERAL_RATIO_PRECISION;

        // Need to adjust for decimals of collateral
        uint256 BdStable_amount_precision = BdStable_amount_post_fee / (10**missing_decimals);
        uint256 collateral_fiat_value = (BdStable_amount_precision * cr_d12) / BdPoolLibrary.PRICE_PRECISION;
        uint256 collateral_needed = (collateral_fiat_value * BdPoolLibrary.PRICE_PRECISION) / getCollateralPrice_d12();

        require(collateral_needed <= collateral_token.balanceOf(address(this)) - unclaimedPoolCollateral, "Not enough collateral in pool");
        require(COLLATERAL_out_min <= collateral_needed, "Slippage limit reached [collateral]");
        require(BDX_out_min <= bdx_amount, "Slippage limit reached [BDX]");
        require(BDSTABLE.canLegallyRedeem(msg.sender), "Cannot legally redeem");

        redeemCollateralBalances[msg.sender] = redeemCollateralBalances[msg.sender] + collateral_needed;

        unclaimedPoolCollateral = unclaimedPoolCollateral + collateral_needed;

        BDSTABLE.refreshCollateralRatio();

        if (bdx_amount > 0) {
            require(BDSTABLE.canLegallyRedeem(msg.sender), "Cannot legally redeem");

            redeemBDXBalances[msg.sender] = redeemBDXBalances[msg.sender] + bdx_amount;

            BDSTABLE.pool_claim_bdx(bdx_amount);
        }

        lastRedeemed[msg.sender] = block.number;

        // Move all external functions to the end
        BDSTABLE.pool_burn_from(msg.sender, BdStable_amount);
    }

    // After a redemption happens, transfer the newly minted BDX and owed collateral from this pool
    // contract to the user. Redemption is split into two functions to prevent flash loans from being able
    // to take out BdStable/collateral from the system, use an AMM to trade the new price, and then mint back into the system.
    function collectRedemption(bool useNativeToken) external {
        require((lastRedeemed[msg.sender] + redemption_delay) <= block.number, "Must wait for redemption_delay blocks before collecting redemption");
        bool sendBDX = false;
        bool sendCollateral = false;
        uint256 BDXAmount;
        uint256 CollateralAmount;

        // Use Checks-Effects-Interactions pattern
        if (redeemBDXBalances[msg.sender] > 0) {
            BDXAmount = redeemBDXBalances[msg.sender];
            redeemBDXBalances[msg.sender] = 0;

            sendBDX = true;
        }

        if (redeemCollateralBalances[msg.sender] > 0) {
            CollateralAmount = redeemCollateralBalances[msg.sender];
            redeemCollateralBalances[msg.sender] = 0;
            unclaimedPoolCollateral = unclaimedPoolCollateral - CollateralAmount;

            sendCollateral = true;
        }

        if (sendBDX == true) {
            BDSTABLE.pool_transfer_claimed_bdx(msg.sender, BDXAmount);
        }
        if (sendCollateral == true) {
            if (useNativeToken) {
                NativeTokenWrapper.withdraw(CollateralAmount);
                safeTransferETH(msg.sender, CollateralAmount);
            } else {
                collateral_token.safeTransfer(msg.sender, CollateralAmount);
            }
        }
    }

    // When the protocol is recollateralizing, we need to give a discount of BDX to hit the new CR target
    // Thus, if the target collateral ratio is higher than the actual value of collateral, minters get BDX for adding collateral
    // This function simply rewards anyone that sends collateral to a pool with the same amount of BDX + the bonus rate
    // Anyone can call this function to recollateralize the protocol and take the extra BDX value from the bonus rate as an arb opportunity
    function recollateralizeBdStable(
        uint256 collateral_amount,
        uint256 BDX_out_min,
        bool useNativeToken
    ) external payable {
        require(recollateralizePaused == false, "Recollateralize is paused");

        if (recollateralizeOnlyForOwner) {
            require(msg.sender == owner(), "Currently only owner can recollateralize");
        }

        if (useNativeToken) {
            require(is_collateral_wrapping_native_token, "Pool doesn't support native token");
            require(msg.value == collateral_amount, "msg.value and collateral_amount do not match");
        }

        updateOraclesIfNeeded();
        uint256 collateral_amount_d18 = collateral_amount * (10**missing_decimals);
        uint256 bdx_price = BDSTABLE.BDX_price_d12();
        uint256 bdStable_total_supply = BDSTABLE.totalSupply();
        uint256 global_collateral_ratio_d12 = BDSTABLE.global_collateral_ratio_d12();
        uint256 global_collat_value = BDSTABLE.globalCollateralValue();

        (uint256 collateral_units, uint256 amount_to_recollat) = BdPoolLibrary.calcRecollateralizeBdStableInner(
            collateral_amount_d18,
            getCollateralPrice_d12(),
            global_collat_value,
            bdStable_total_supply,
            global_collateral_ratio_d12
        );

        uint256 collateral_units_precision = collateral_units / (10**missing_decimals);

        uint256 bdx_paid_back = (amount_to_recollat * (uint256(BdPoolLibrary.PRICE_PRECISION) + bonus_rate - recollat_fee)) / bdx_price;
        uint256 bdx_coverage_ratio = BDSTABLE.get_effective_bdx_coverage_ratio();
        bdx_paid_back = (bdx_paid_back * bdx_coverage_ratio) / BdPoolLibrary.COLLATERAL_RATIO_PRECISION;

        require(BDX_out_min <= bdx_paid_back, "Slippage limit reached");

        BDSTABLE.refreshCollateralRatio();

        if (useNativeToken) {
            // no need to check collateral_units_precision, it's <= then collateral_amount

            NativeTokenWrapper.deposit{value: collateral_units_precision}();

            // refund remaining native token, if any left
            if (msg.value > collateral_units_precision) {
                safeTransferETH(msg.sender, msg.value - collateral_units_precision);
            }
        } else {
            collateral_token.safeTransferFrom(msg.sender, address(this), collateral_units_precision);
        }

        if (bdx_paid_back > 0) {
            BDSTABLE.transfer_bdx(msg.sender, bdx_paid_back);
        }

        emit Recollateralized(collateral_units_precision, bdx_paid_back);
    }

    // Function can be called by an BDX holder to have the protocol buy back BDX with excess collateral value from a desired collateral pool
    // This can also happen if the collateral ratio > 1
    function buyBackBDX(
        uint256 BDX_amount,
        uint256 COLLATERAL_out_min,
        bool useNativeToken
    ) external {
        require(buyBackPaused == false, "Buyback is paused");

        if (buybackOnlyForOwner) {
            require(msg.sender == owner(), "Currently only owner can buyback");
        }

        updateOraclesIfNeeded();

        uint256 bdx_price = BDSTABLE.BDX_price_d12();

        uint256 collateral_equivalent_d18 = (BdPoolLibrary.calcBuyBackBDX(
            BDSTABLE.availableExcessCollatDV(),
            bdx_price,
            getCollateralPrice_d12(),
            BDX_amount
        ) * (uint256(BdPoolLibrary.PRICE_PRECISION) - buyback_fee)) / BdPoolLibrary.PRICE_PRECISION;

        uint256 collateral_precision = collateral_equivalent_d18 / (10**missing_decimals);

        require(COLLATERAL_out_min <= collateral_precision, "Slippage limit reached");

        // Take bdx from sender
        BDX.safeTransferFrom(msg.sender, address(BDSTABLE), BDX_amount);

        if (useNativeToken) {
            // Give the sender their desired collateral
            NativeTokenWrapper.withdraw(collateral_precision);
            safeTransferETH(msg.sender, collateral_precision);
        } else {
            // Give the sender their desired collateral
            collateral_token.safeTransfer(msg.sender, collateral_precision);
        }

        emit BoughtBack(BDX_amount, collateral_precision);
    }

    receive() external payable {
        require(msg.sender == address(NativeTokenWrapper), "Only native token wrapper allowed to send native token");
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setCollatWETHOracle(address _collateral_weth_oracle_address, address _weth_address) external onlyOwner {
        require(_collateral_weth_oracle_address != address(0), "Oracle cannot be set to the zero address");
        require(_weth_address != address(0), "WETH cannot be set to the zero address");

        collatWEthOracle = ICryptoPairOracle(_collateral_weth_oracle_address);
        weth_address = _weth_address;

        emit CollateralWethOracleSet(_collateral_weth_oracle_address, _weth_address);
    }

    function toggleMintingPaused() external onlyOwner {
        mintPaused = !mintPaused;

        emit MintingPausedToggled(mintPaused);
    }

    function toggleRedeemingPaused() external onlyOwner {
        redeemPaused = !redeemPaused;

        emit RedeemingPausedToggled(redeemPaused);
    }

    function toggleRecollateralizePaused() external onlyOwner {
        recollateralizePaused = !recollateralizePaused;

        emit RecollateralizePausedToggled(recollateralizePaused);
    }

    function toggleBuybackPaused() external onlyOwner {
        buyBackPaused = !buyBackPaused;

        emit BuybackPausedToggled(buyBackPaused);
    }

    function toggleBuybackOnlyForOwner() external onlyOwner {
        buybackOnlyForOwner = !buybackOnlyForOwner;

        emit BuybackOnlyForOwnerToggled(buybackOnlyForOwner);
    }

    function toggleRecollateralizeOnlyForOwner() external onlyOwner {
        recollateralizeOnlyForOwner = !recollateralizeOnlyForOwner;

        emit RecollateralizeOnlyForOwnerToggled(recollateralizeOnlyForOwner);
    }

    function toggleCollateralPricePaused(uint256 _new_price) external onlyOwner {
        // If pausing, set paused price; else if unpausing, clear pausedPrice
        if (collateralPricePaused == false) {
            pausedPrice = _new_price;
        } else {
            pausedPrice = 0;
        }
        collateralPricePaused = !collateralPricePaused;

        emit CollateralPriceToggled(collateralPricePaused);
    }

    // Combined into one function due to 24KiB contract memory limit
    function setPoolParameters(
        uint256 new_ceiling,
        uint256 new_bonus_rate,
        uint256 new_redemption_delay,
        uint256 new_mint_fee,
        uint256 new_redeem_fee,
        uint256 new_buyback_fee,
        uint256 new_recollat_fee
    ) external onlyOwner {
        pool_ceiling = new_ceiling;
        bonus_rate = new_bonus_rate;
        redemption_delay = new_redemption_delay;
        minting_fee = new_mint_fee;
        redemption_fee = new_redeem_fee;
        buyback_fee = new_buyback_fee;
        recollat_fee = new_recollat_fee;

        emit PoolParametersSet(new_ceiling, new_bonus_rate, new_redemption_delay, new_mint_fee, new_redeem_fee, new_buyback_fee, new_recollat_fee);
    }

    function safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "ETH transfer failed");
    }

    function withdrawCollateral(uint256 withdrawAmount, address withdrawalAddress) external onlyOwner {
        require(withdrawalAddress != address(0), "Cannot withdraw to zero address");
        require(withdrawAmount > 0, "Amount to withdraw is missing");

        uint256 totalCollateralAmount = collateral_token.balanceOf(address(this));
        require(withdrawAmount <= totalCollateralAmount, "Insufficient collateral to withdraw");

        if (is_collateral_wrapping_native_token) {
            NativeTokenWrapper.withdraw(withdrawAmount);
            safeTransferETH(withdrawalAddress, withdrawAmount);
        } else {
            collateral_token.safeTransfer(withdrawalAddress, withdrawAmount);
        }
    }

    /* ========== EVENTS ========== */

    event PoolParametersSet(
        uint256 new_ceiling,
        uint256 new_bonus_rate,
        uint256 new_redemption_delay,
        uint256 new_mint_fee,
        uint256 new_redeem_fee,
        uint256 new_buyback_fee,
        uint256 new_recollat_fee
    );
    event MintingPausedToggled(bool toggled);
    event RedeemingPausedToggled(bool toggled);
    event RecollateralizePausedToggled(bool toggled);
    event BuybackPausedToggled(bool toggled);
    event CollateralPriceToggled(bool toggled);
    event CollateralWethOracleSet(address indexed collateral_weth_oracle_address, address indexed weth_address);
    event RecollateralizeOnlyForOwnerToggled(bool recollateralizeOnlyForOwner);
    event BuybackOnlyForOwnerToggled(bool buybackOnlyForOwner);
    event Recollateralized(uint256 indexed collateral_amount_paid, uint256 indexed bdx_paid_back);
    event BoughtBack(uint256 indexed bdx_amount_paid, uint256 indexed collateral_paid_back);
}
