// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

// Modified from Synthetixio
// https://raw.githubusercontent.com/Synthetixio/synthetix/develop/contracts/StakingRewards.sol

import "../Math/Math.sol";
import "../Math/SafeMath.sol";
import "../ERC20/ERC20.sol";
import '../Uniswap/TransferHelper.sol';
import "../ERC20/SafeERC20.sol";
import "../Utils/ReentrancyGuard.sol";
import "./StakingRewardsDistribution.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Inheritance
import "hardhat/console.sol";

//todo ag remove all unupgradable dependencies
//https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/master/contracts/access/OwnableUpgradeable.sol
//https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/master/contracts/security/PausableUpgradeable.sol
contract StakingRewards is 
    ReentrancyGuard, 
    PausableUpgradeable,
    OwnableUpgradeable
{
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    // Constant for various precisions
    uint256 private constant LOCK_MULTIPLIER_PRECISION = 1e6;

    uint256 public constant REWARD_PRECISON = 1e18;

    uint256 private DeploymentTimestamp;

    /* ========== STATE VARIABLES ========== */

    ERC20 public stakingToken;
    address public timelock_address; // Governance timelock address
    StakingRewardsDistribution stakingRewardsDistribution;

    uint256 public periodFinish;
    bool isTrueBdPool;
    bool isInitialized;

    uint256 public rewardsDurationSeconds;

    uint256 public lastUpdateTime; // time when recent reward per token has been calculated
    uint256 public rewardPerTokenStored_REWARD_PRECISON;

    mapping(address => uint256) public userRewardPerTokenPaid_REWARD_PRECISON;
    mapping(address => uint256) public rewards;

    uint256 private _staking_token_supply;
    uint256 private _staking_token_boosted_supply;
    mapping(address => uint256) private _unlocked_balances;
    mapping(address => uint256) private _locked_balances;
    mapping(address => uint256) private _boosted_balances;

    mapping(address => LockedStake[]) private lockedStakes;

    mapping(address => bool) public greylist;

    bool public unlockedStakes; // Release lock stakes in case of system migration

    struct LockedStake {
        bytes32 kek_id;
        uint256 start_timestamp;
        uint256 amount;
        uint256 ending_timestamp;
        uint256 multiplier_LOCK_MULTIPLIER_PRECISION;
    }

    /* ========== CONSTRUCTOR ========== */

    function initialize (
        address _stakingToken,
        address _timelock_address,
        address _stakingRewardsDistribution,
        bool _isTrueBdPool
    ) 
        external
        initializer
    {
        require(!isInitialized, "contract can be initialized once only");

        __Ownable_init();
        __Pausable_init();

        stakingToken = ERC20(_stakingToken);
        timelock_address = _timelock_address;
        stakingRewardsDistribution = StakingRewardsDistribution(_stakingRewardsDistribution);
        DeploymentTimestamp = block.timestamp;
        isTrueBdPool = _isTrueBdPool;

        rewardsDurationSeconds = 604800; // 7 * 86400  (7 days)
        unlockedStakes = false;

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp.add(rewardsDurationSeconds);

        isInitialized = true;
    }

    /* ========== VIEWS ========== */

    function totalSupply() public view returns (uint256) {
        return _staking_token_supply;
    }

    function totalBoostedSupply() external view returns (uint256) {
        return _staking_token_boosted_supply;
    }

    function lockedStakingMultiplier_LOCK_MULTIPLIER_PRECISION(uint256 yearsNo) public pure returns (uint256) {
        if(yearsNo == 10){
            return 50000000;
        } else if(yearsNo == 5){
            return 10000000;
        } else if(yearsNo == 3){
            return 3000000;
        } else if(yearsNo == 2){
            return 2333000;
        } else if(yearsNo == 1){
            return 1667000;
        }
        else{
            revert("Not supported staking duration");
        }
    }

    // Total unlocked and locked liquidity tokens
    function balanceOf(address account) public view returns (uint256) {
        return (_unlocked_balances[account]).add(_locked_balances[account]);
    }

    // Total unlocked liquidity tokens
    function unlockedBalanceOf(address account) external view returns (uint256) {
        return _unlocked_balances[account];
    }

    // Total locked liquidity tokens
    function lockedBalanceOf(address account) public view returns (uint256) {
        return _locked_balances[account];
    }

    // Total 'balance' used for calculating the percent of the pool the account owns
    // Takes into account the locked stake time multiplier
    function boostedBalanceOf(address account) external view returns (uint256) {
        return _boosted_balances[account];
    }

    function lockedStakesOf(address account) external view returns (LockedStake[] memory) {
        return lockedStakes[account];
    }

    function stakingDecimals() external view returns (uint256) {
        return stakingToken.decimals();
    }

    function rewardsFor(address account) external view returns (uint256) {
        // You may have use earned() instead, because of the order in which the contract executes 
        return rewards[account];
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return Math.min(block.timestamp, periodFinish);
    }

    function rewardPerToken() public view returns (uint256) {
        if (_staking_token_supply == 0) {
            return rewardPerTokenStored_REWARD_PRECISON;
        }
        else {
            return rewardPerTokenStored_REWARD_PRECISON
                .add(lastTimeRewardApplicable()
                    .sub(lastUpdateTime)
                    .mul(stakingRewardsDistribution.getRewardRatePerSecond(address(this)))
                    .mul(REWARD_PRECISON)
                    .div(_staking_token_boosted_supply));
        }
    }

    function earned(address account) public view returns (uint256) {
        return _boosted_balances[account]
            .mul(
                rewardPerToken()
                .sub(userRewardPerTokenPaid_REWARD_PRECISON[account]))
            .div(REWARD_PRECISON)
            .add(rewards[account]);
    }

    // Precision 1e18 for compatibility with ERC20 token
    function getRewardForDuration() external view returns (uint256) {
        return stakingRewardsDistribution.getRewardRatePerSecond(address(this))
            .mul(rewardsDurationSeconds);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function stake(uint256 amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        require(greylist[msg.sender] == false, "address has been greylisted");

        // Pull the tokens from the staker
        TransferHelper.safeTransferFrom(address(stakingToken), msg.sender, address(this), amount);

        // Staking token supply and boosted supply
        _staking_token_supply = _staking_token_supply.add(amount);
        _staking_token_boosted_supply = _staking_token_boosted_supply.add(amount);

        // Staking token balance and boosted balance
        _unlocked_balances[msg.sender] = _unlocked_balances[msg.sender].add(amount);
        _boosted_balances[msg.sender] = _boosted_balances[msg.sender].add(amount);

        emit Staked(msg.sender, amount);
    }

    function stakeLocked(uint256 amount, uint256 yearsNo) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        if(yearsNo == 10){
            require(
                isTrueBdPool,
                "You can only stake locked liquidity 10 years for true BD pools"
            );
        }
        else{
            require(
                yearsNo == 1 || yearsNo == 2 || yearsNo == 3 || yearsNo == 5 || yearsNo == 10,
                "You can only stake locked liquidity for 1, 2, 3, 5 or 10 years"
            );
        }
        require(greylist[msg.sender] == false, "address has been greylisted");

        uint256 secs = yearsNo * 365 * 24 * 60 * 60;

        uint256 multiplier = lockedStakingMultiplier_LOCK_MULTIPLIER_PRECISION(yearsNo);
        uint256 boostedAmount = amount.mul(multiplier).div(LOCK_MULTIPLIER_PRECISION);
        lockedStakes[msg.sender].push(LockedStake(
            keccak256(abi.encodePacked(msg.sender, block.timestamp, amount)),
            block.timestamp,
            amount,
            block.timestamp.add(secs),
            multiplier
        ));

        // Pull the tokens from the staker
        TransferHelper.safeTransferFrom(address(stakingToken), msg.sender, address(this), amount);

        // Staking token supply and boosted supply
        _staking_token_supply = _staking_token_supply.add(amount);
        _staking_token_boosted_supply = _staking_token_boosted_supply.add(boostedAmount);

        // Staking token balance and boosted balance
        _locked_balances[msg.sender] = _locked_balances[msg.sender].add(amount);
        _boosted_balances[msg.sender] = _boosted_balances[msg.sender].add(boostedAmount);

        emit StakeLocked(msg.sender, amount, secs);
    }

    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");

        // Staking token balance and boosted balance
        _unlocked_balances[msg.sender] = _unlocked_balances[msg.sender].sub(amount);
        _boosted_balances[msg.sender] = _boosted_balances[msg.sender].sub(amount);

        // Staking token supply and boosted supply
        _staking_token_supply = _staking_token_supply.sub(amount);
        _staking_token_boosted_supply = _staking_token_boosted_supply.sub(amount);

        // Give the tokens to the withdrawer
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function withdrawLocked(bytes32 kek_id) public nonReentrant updateReward(msg.sender) {
        LockedStake memory thisStake;
        thisStake.amount = 0;
        uint theIndex;
        for (uint i = 0; i < lockedStakes[msg.sender].length; i++){ 
            if (kek_id == lockedStakes[msg.sender][i].kek_id){
                thisStake = lockedStakes[msg.sender][i];
                theIndex = i;
                break;
            }
        }
        require(thisStake.kek_id == kek_id, "Stake not found");
        require(block.timestamp >= thisStake.ending_timestamp || unlockedStakes == true, "Stake is still locked!");

        uint256 theAmount = thisStake.amount;
        uint256 boostedAmount = theAmount.mul(thisStake.multiplier_LOCK_MULTIPLIER_PRECISION).div(LOCK_MULTIPLIER_PRECISION);

        if (theAmount > 0){
            // Staking token balance and boosted balance
            _locked_balances[msg.sender] = _locked_balances[msg.sender].sub(theAmount);
            _boosted_balances[msg.sender] = _boosted_balances[msg.sender].sub(boostedAmount);

            // Staking token supply and boosted supply
            _staking_token_supply = _staking_token_supply.sub(theAmount);
            _staking_token_boosted_supply = _staking_token_boosted_supply.sub(boostedAmount);

            // Remove the stake from the array
            delete lockedStakes[msg.sender][theIndex];

            // Give the tokens to the withdrawer
            stakingToken.safeTransfer(msg.sender, theAmount);

            emit WithdrawnLocked(msg.sender, theAmount, kek_id);
        }
    }

    function getReward() public nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            stakingRewardsDistribution.transferRewards(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function renewIfApplicable() external {
        if (block.timestamp > periodFinish) {
            retroCatchUp();
        }
    }

    // If the period expired, renew it
    function retroCatchUp() internal {
        // Failsafe check
        require(block.timestamp > periodFinish, "Period has not expired yet!");

        uint256 num_periods_elapsed = uint256(block.timestamp.sub(periodFinish)) / rewardsDurationSeconds; // Floor division to the nearest period

        periodFinish = periodFinish.add((num_periods_elapsed.add(1)).mul(rewardsDurationSeconds));

        rewardPerTokenStored_REWARD_PRECISON = rewardPerToken();

        lastUpdateTime = lastTimeRewardApplicable();

        emit RewardsPeriodRenewed(address(stakingToken));
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    // Added to support recovering LP Rewards from other systems to be distributed to holders
    function recoverERC20(address tokenAddress, uint256 tokenAmount) external onlyByOwnerOrGovernance {
        // Admin cannot withdraw the staking token from the contract
        require(tokenAddress != address(stakingToken));
        ERC20(tokenAddress).transfer(owner(), tokenAmount);
        emit Recovered(tokenAddress, tokenAmount);
    }

    function setRewardsDuration(uint256 _rewardsDurationSeconds) external onlyByOwnerOrGovernance {
        require(
            periodFinish == 0 || block.timestamp > periodFinish,
            "Previous rewards period must be complete before changing the duration for the new period"
        );
        rewardsDurationSeconds = _rewardsDurationSeconds;
        emit RewardsDurationUpdated(rewardsDurationSeconds);
    }

    function greylistAddress(address _address) external onlyByOwnerOrGovernance {
        greylist[_address] = !(greylist[_address]);
    }

    function unlockStakes() external onlyByOwnerOrGovernance {
        unlockedStakes = !unlockedStakes;
    }

    function setOwnerAndTimelock(address _new_owner, address _new_timelock) external onlyByOwnerOrGovernance {
        transferOwnership(_new_owner);
        timelock_address = _new_timelock;
    }

    /* ========== MODIFIERS ========== */

    modifier updateReward(address account) {
        
        // Need to retro-adjust some things if the period hasn't been renewed, then start a new one
        if (block.timestamp > periodFinish) {
            retroCatchUp();
        }
        else {
            rewardPerTokenStored_REWARD_PRECISON = rewardPerToken();
            lastUpdateTime = lastTimeRewardApplicable();
        }

        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid_REWARD_PRECISON[account] = rewardPerTokenStored_REWARD_PRECISON;
        }
        _;
    }

    modifier onlyByOwnerOrGovernance() {
        require(msg.sender == owner() || msg.sender == timelock_address, "You are not the owner or the governance timelock");
        _;
    }

    /* ========== EVENTS ========== */

    event Staked(address indexed user, uint256 amount);
    event StakeLocked(address indexed user, uint256 amount, uint256 secs);
    event Withdrawn(address indexed user, uint256 amount);
    event WithdrawnLocked(address indexed user, uint256 amount, bytes32 kek_id);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event Recovered(address token, uint256 amount);
    event RewardsPeriodRenewed(address token);
}
