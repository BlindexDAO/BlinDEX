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
import "../Frax/BDStable.sol";
import "../Utils/ReentrancyGuard.sol";
import "../Utils/StringHelpers.sol";

// Inheritance
import "./IStakingRewards.sol";
import "./RewardsDistributionRecipient.sol";
import "./Pausable.sol";

contract StakingRewards is IStakingRewards, RewardsDistributionRecipient, ReentrancyGuard, Pausable {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    // Constant for various precisions
    uint256 private constant PRICE_PRECISION = 1e6;

    uint256 public constant ERC20_PRCISON = 1e18;
    uint256 public constant BDX_REWARD_PRCISION = 1e18;
    uint256 public constant TOTAL_BDX_SUPPLY = 21000000;

    // BDX minting schedule
    // They sum up to 50% of TOTAL_LPs_BDX_SUPPLY
    //   as this much is reserved for liquidity mining rewards
    uint256 public constant BDX_MINTING_SCHEDULE_PRECISON = 1000;
    uint256 public immutable BDX_MINTING_SCHEDULE_YEAR_1;
    uint256 public immutable BDX_MINTING_SCHEDULE_YEAR_2;
    uint256 public immutable BDX_MINTING_SCHEDULE_YEAR_3;
    uint256 public immutable BDX_MINTING_SCHEDULE_YEAR_4;
    uint256 public immutable BDX_MINTING_SCHEDULE_YEAR_5;

    uint256 private immutable DeploymentTimestamp;
    uint256 private immutable EndOfYear_1;
    uint256 private immutable EndOfYear_2;
    uint256 private immutable EndOfYear_3;
    uint256 private immutable EndOfYear_4;
    uint256 private immutable EndOfYear_5;

    /* ========== STATE VARIABLES ========== */

    BdStable private bdStable;
    ERC20 public rewardsToken;
    ERC20 public stakingToken;
    uint256 public periodFinish;
    bool isTrueBdPool;

    uint256 public rewardsDurationSeconds = 604800; // 7 * 86400  (7 days)

    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored = 0;
    uint256 public pool_weight_1e6; // This staking pool's fraction of the total FXS being distributed by all pools, 6 decimals of precision

    address public owner_address;
    address public timelock_address; // Governance timelock address

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 private _staking_token_supply = 0;
    uint256 private _staking_token_boosted_supply = 0;
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
        uint256 multiplier_PRICE_PRECISION;
    }

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _owner,
        address _rewardsDistribution,
        address _rewardsToken,
        address _stakingToken,
        address _bdStable_address,
        address _timelock_address,
        uint256 _pool_weight_1e6,
        uint256 _deploymentTimestamp,
        bool _isTrueBdPool
    ) public Owned(_owner) {
        owner_address = _owner;
        rewardsToken = ERC20(_rewardsToken);
        stakingToken = ERC20(_stakingToken);
        bdStable = BDStable(_bdStable_address);
        rewardsDistribution = _rewardsDistribution;
        lastUpdateTime = block.timestamp;
        timelock_address = _timelock_address;
        pool_weight_1e6 = _pool_weight_1e6;
        DeploymentTimestamp = _deploymentTimestamp;
        isTrueBdPool = _isTrueBdPool;

        unlockedStakes = false;

        BDX_MINTING_SCHEDULE_YEAR_1 = TOTAL_BDX_SUPPLY.mul(ERC20_PRCISON).mul(200).mul(_pool_weight_1e6).div(1e6).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_2 = TOTAL_BDX_SUPPLY.mul(ERC20_PRCISON).mul(125).mul(_pool_weight_1e6).div(1e6).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_3 = TOTAL_BDX_SUPPLY.mul(ERC20_PRCISON).mul(100).mul(_pool_weight_1e6).div(1e6).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_4 = TOTAL_BDX_SUPPLY.mul(ERC20_PRCISON).mul(50).mul(_pool_weight_1e6).div(1e6).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_5 = TOTAL_BDX_SUPPLY.mul(ERC20_PRCISON).mul(25).mul(_pool_weight_1e6).div(1e6).div(BDX_MINTING_SCHEDULE_PRECISON);

        EndOfYear_1 = _deploymentTimestamp + 365 days;
        EndOfYear_2 = _deploymentTimestamp + 2 * 365 days;
        EndOfYear_3 = _deploymentTimestamp + 3 * 365 days;
        EndOfYear_4 = _deploymentTimestamp + 4 * 365 days;
        EndOfYear_5 = _deploymentTimestamp + 5 * 365 days;
    }

    /* ========== VIEWS ========== */

    function totalSupply() external override view returns (uint256) {
        return _staking_token_supply;
    }

    function totalBoostedSupply() external view returns (uint256) {
        return _staking_token_boosted_supply;
    }

    function lockedStakingMultiplier_PRICE_PRECISION(uint256 yearsNo) public pure returns (uint256) {
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
    function balanceOf(address account) external override view returns (uint256) {
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

    function lastTimeRewardApplicable() public override view returns (uint256) {
        return Math.min(block.timestamp, periodFinish);
    }

    function rewardPerToken() public override view returns (uint256) {
        if (_staking_token_supply == 0) {
            return rewardPerTokenStored;
        }
        else {
            return rewardPerTokenStored
                .add(lastTimeRewardApplicable()
                    .sub(lastUpdateTime)
                    .mul(getRewardRatePerSecond())
                    .div(PRICE_PRECISION)
                    .div(_staking_token_boosted_supply)
            );
        }
    }

    function earned(address account) public override view returns (uint256) {
        return _boosted_balances[account]
            .mul(
                rewardPerToken()
                .sub(userRewardPerTokenPaid[account]))
            .div(1e18)
            .add(rewards[account]);
    }

    // Precision 1e18 for compatibility with ERC20 token
    function getRewardRatePerSecond() internal view returns (uint256) {
        uint256 yearSchedule = 0;

        if(block.timestamp < EndOfYear_1){
            yearSchedule = BDX_MINTING_SCHEDULE_YEAR_1;
        } else if(block.timestamp < EndOfYear_2){
            yearSchedule = BDX_MINTING_SCHEDULE_YEAR_2;
        } else if(block.timestamp < EndOfYear_3){
            yearSchedule = BDX_MINTING_SCHEDULE_YEAR_3;
        } else if(block.timestamp < EndOfYear_4){
            yearSchedule = BDX_MINTING_SCHEDULE_YEAR_4;
        } else if(block.timestamp < EndOfYear_5){
            yearSchedule = BDX_MINTING_SCHEDULE_YEAR_5;
        } else {
            yearSchedule = 0;
        }

        uint256 bdxPerSecond = yearSchedule.div(365*24*60*60);

        return bdxPerSecond;
    }

    // Precision 1e18 for compatibility with ERC20 token
    function getRewardForDuration() external override view returns (uint256) {
        return getRewardRatePerSecond()
            .mul(rewardsDurationSeconds)
            .div(PRICE_PRECISION);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function stake(uint256 amount) external override nonReentrant notPaused updateReward(msg.sender) {
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

    function stakeLocked(uint256 amount, uint256 yearsNo) external nonReentrant notPaused updateReward(msg.sender) {
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

        uint256 multiplier = lockedStakingMultiplier_PRICE_PRECISION(yearsNo);
        uint256 boostedAmount = amount.mul(multiplier).div(PRICE_PRECISION);
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

    function withdraw(uint256 amount) public override nonReentrant updateReward(msg.sender) {
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
        uint256 boostedAmount = theAmount.mul(thisStake.multiplier_PRICE_PRECISION).div(PRICE_PRECISION);
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

    function getReward() public override nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsToken.transfer(msg.sender, reward);
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

        // Ensure the provided reward amount is not more than the balance in the contract.
        // This keeps the reward rate in the right range, preventing overflows due to
        // very high values of getRewardRatePerSecond() in the earned and rewardsPerToken functions;
        // Reward + leftover must be less than 2^256 / 10^18 to avoid overflow.
        uint256 num_periods_elapsed = uint256(block.timestamp.sub(periodFinish)) / rewardsDurationSeconds; // Floor division to the nearest period
        uint balance = rewardsToken.balanceOf(address(this));
        require(getRewardRatePerSecond()
            .mul(rewardsDurationSeconds)
            .mul(num_periods_elapsed + 1)
            .div(PRICE_PRECISION) <= balance, "Not enough FXS available for rewards!");

        periodFinish = periodFinish.add((num_periods_elapsed.add(1)).mul(rewardsDurationSeconds));

        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();

        emit RewardsPeriodRenewed(address(stakingToken));
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    // Added to support recovering LP Rewards from other systems to be distributed to holders
    function recoverERC20(address tokenAddress, uint256 tokenAmount) external onlyByOwnerOrGovernance {
        // Admin cannot withdraw the staking token from the contract
        require(tokenAddress != address(stakingToken));
        ERC20(tokenAddress).transfer(owner_address, tokenAmount);
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

    function initializeDefault() external onlyByOwnerOrGovernance {
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp.add(rewardsDurationSeconds);
        emit DefaultInitialization();
    }

    function greylistAddress(address _address) external onlyByOwnerOrGovernance {
        greylist[_address] = !(greylist[_address]);
    }

    function unlockStakes() external onlyByOwnerOrGovernance {
        unlockedStakes = !unlockedStakes;
    }

    function setOwnerAndTimelock(address _new_owner, address _new_timelock) external onlyByOwnerOrGovernance {
        owner_address = _new_owner;
        timelock_address = _new_timelock;
    }

    /* ========== MODIFIERS ========== */

    modifier updateReward(address account) {
        // Need to retro-adjust some things if the period hasn't been renewed, then start a new one
        if (block.timestamp > periodFinish) {
            retroCatchUp();
        }
        else {
            rewardPerTokenStored = rewardPerToken();
            lastUpdateTime = lastTimeRewardApplicable();
        }
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    modifier onlyByOwnerOrGovernance() {
        require(msg.sender == owner_address || msg.sender == timelock_address, "You are not the owner or the governance timelock");
        _;
    }

    /* ========== EVENTS ========== */

    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event StakeLocked(address indexed user, uint256 amount, uint256 secs);
    event Withdrawn(address indexed user, uint256 amount);
    event WithdrawnLocked(address indexed user, uint256 amount, bytes32 kek_id);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event Recovered(address token, uint256 amount);
    event RewardsPeriodRenewed(address token);
    event DefaultInitialization();
}
