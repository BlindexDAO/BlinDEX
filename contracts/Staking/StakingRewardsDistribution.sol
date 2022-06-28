// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../Bdx/BDXShares.sol";
import "./Vesting.sol";
import "./StakingRewards.sol";

contract StakingRewardsDistribution is OwnableUpgradeable {
    using SafeERC20Upgradeable for BDXShares;

    uint256 public TOTAL_BDX_SUPPLY;

    uint256 public constant HUNDRED_PERCENT = 100;
    uint256 public constant MAX_REWARD_FEE = 1e12;

    // BDX minting schedule
    // They sum up to 50% of TOTAL_BDX_SUPPLY
    //   as this much is reserved for liquidity mining rewards
    uint256 public constant BDX_MINTING_SCHEDULE_PRECISON = 1000;
    uint256 public BDX_MINTING_SCHEDULE_YEAR_1;
    uint256 public BDX_MINTING_SCHEDULE_YEAR_2;
    uint256 public BDX_MINTING_SCHEDULE_YEAR_3;
    uint256 public BDX_MINTING_SCHEDULE_YEAR_4;
    uint256 public BDX_MINTING_SCHEDULE_YEAR_5;

    uint256 public EndOfYear_1;
    uint256 public EndOfYear_2;
    uint256 public EndOfYear_3;
    uint256 public EndOfYear_4;
    uint256 public EndOfYear_5;

    uint256 public vestingRewardRatio_percent;
    uint256 public rewardFee_d12;

    BDXShares public rewardsToken;
    Vesting public vesting;
    address public treasury;

    mapping(address => uint256) public stakingRewardsWeights;
    address[] public stakingRewardsAddresses;
    uint256 public stakingRewardsWeightsTotal;

    bool public collectingPaused;

    function initialize(
        address _rewardsToken,
        address _vesting,
        address _treasury,
        uint256 _vestingRewardRatio_percent
    ) external initializer {
        require(_rewardsToken != address(0), "Rewards address cannot be 0");
        require(_vesting != address(0), "Vesting address cannot be 0");
        require(_treasury != address(0), "Treasury address cannot be 0");
        require(_vestingRewardRatio_percent <= 100, "VestingRewardRatio_percent must be <= 100");

        __Ownable_init();

        rewardsToken = BDXShares(_rewardsToken);
        vesting = Vesting(_vesting);
        treasury = _treasury;
        TOTAL_BDX_SUPPLY = rewardsToken.MAX_TOTAL_SUPPLY();

        BDX_MINTING_SCHEDULE_YEAR_1 = (TOTAL_BDX_SUPPLY * 200) / BDX_MINTING_SCHEDULE_PRECISON;
        BDX_MINTING_SCHEDULE_YEAR_2 = (TOTAL_BDX_SUPPLY * 125) / BDX_MINTING_SCHEDULE_PRECISON;
        BDX_MINTING_SCHEDULE_YEAR_3 = (TOTAL_BDX_SUPPLY * 100) / BDX_MINTING_SCHEDULE_PRECISON;
        BDX_MINTING_SCHEDULE_YEAR_4 = (TOTAL_BDX_SUPPLY * 50) / BDX_MINTING_SCHEDULE_PRECISON;
        BDX_MINTING_SCHEDULE_YEAR_5 = (TOTAL_BDX_SUPPLY * 25) / BDX_MINTING_SCHEDULE_PRECISON;

        EndOfYear_1 = block.timestamp + 365 days;
        EndOfYear_2 = block.timestamp + 2 * 365 days;
        EndOfYear_3 = block.timestamp + 3 * 365 days;
        EndOfYear_4 = block.timestamp + 4 * 365 days;
        EndOfYear_5 = block.timestamp + 5 * 365 days;

        vestingRewardRatio_percent = _vestingRewardRatio_percent;
        rewardFee_d12 = 1e11; // 10%
    }

    // Precision 1e18 for compatibility with ERC20 token
    function getRewardRatePerSecond(address _stakingRewardsAddress) external view returns (uint256) {
        uint256 yearSchedule = 0;

        if (block.timestamp < EndOfYear_1) {
            yearSchedule = BDX_MINTING_SCHEDULE_YEAR_1;
        } else if (block.timestamp < EndOfYear_2) {
            yearSchedule = BDX_MINTING_SCHEDULE_YEAR_2;
        } else if (block.timestamp < EndOfYear_3) {
            yearSchedule = BDX_MINTING_SCHEDULE_YEAR_3;
        } else if (block.timestamp < EndOfYear_4) {
            yearSchedule = BDX_MINTING_SCHEDULE_YEAR_4;
        } else if (block.timestamp < EndOfYear_5) {
            yearSchedule = BDX_MINTING_SCHEDULE_YEAR_5;
        } else {
            yearSchedule = 0;
        }

        uint256 bdxPerSecond = (yearSchedule * stakingRewardsWeights[_stakingRewardsAddress]) / (365 * 24 * 60 * 60) / stakingRewardsWeightsTotal;

        return bdxPerSecond;
    }

    function registerPools(address[] calldata _stakingRewardsAddresses, uint256[] calldata _stakingRewardsWeights) external onlyOwner {
        require(_stakingRewardsAddresses.length == _stakingRewardsWeights.length, "Pools addresses and weights lengths should be the same");

        for (uint256 i = 0; i < _stakingRewardsAddresses.length; i++) {
            if (stakingRewardsWeights[_stakingRewardsAddresses[i]] == 0) {
                // to avoid duplicates
                stakingRewardsAddresses.push(_stakingRewardsAddresses[i]);
            }

            stakingRewardsWeightsTotal -= stakingRewardsWeights[_stakingRewardsAddresses[i]]; // to support override
            stakingRewardsWeights[_stakingRewardsAddresses[i]] = _stakingRewardsWeights[i];
            stakingRewardsWeightsTotal += _stakingRewardsWeights[i];
            emit PoolRegistered(_stakingRewardsAddresses[i], _stakingRewardsWeights[i]);
        }
    }

    function unregisterPool(
        address pool,
        uint256 from,
        uint256 to
    ) external onlyOwner {
        to = to < stakingRewardsAddresses.length ? to : stakingRewardsAddresses.length;

        stakingRewardsWeightsTotal -= stakingRewardsWeights[pool];
        stakingRewardsWeights[pool] = 0;

        for (uint256 i = from; i < to; i++) {
            if (stakingRewardsAddresses[i] == pool) {
                stakingRewardsAddresses[i] = stakingRewardsAddresses[stakingRewardsAddresses.length - 1];
                stakingRewardsAddresses.pop();

                emit PoolRemoved(pool);
                return;
            }
        }
    }

    function collectAllRewards(uint256 from, uint256 to) external collectingNotPaused {
        to = to < stakingRewardsAddresses.length ? to : stakingRewardsAddresses.length;

        uint256 totalFee;
        uint256 totalRewardToRelease;
        uint256 totalRewardToVest;
        for (uint256 i = from; i < to; i++) {
            StakingRewards stakingRewards = StakingRewards(stakingRewardsAddresses[i]);

            stakingRewards.updateUserReward(msg.sender);
            uint256 poolReward = stakingRewards.rewards(msg.sender);

            if (poolReward > 0) {
                uint256 rewardFee = (poolReward * rewardFee_d12) / MAX_REWARD_FEE;
                uint256 userReward = poolReward - rewardFee;

                uint256 immediatelyReleasedReward = calculateImmediateReward(userReward);
                uint256 vestedReward = userReward - immediatelyReleasedReward;

                totalFee = totalFee + rewardFee;
                totalRewardToRelease = totalRewardToRelease + immediatelyReleasedReward;
                totalRewardToVest = totalRewardToVest + vestedReward;

                stakingRewards.releaseReward(msg.sender, immediatelyReleasedReward, vestedReward);
            }
        }

        if (totalRewardToRelease > 0 || totalRewardToVest > 0) {
            releaseReward(msg.sender, totalRewardToRelease, totalRewardToVest);
            rewardsToken.safeTransfer(treasury, totalFee);
        }
    }

    function setVestingRewardRatio(uint256 _vestingRewardRatio) external onlyOwner {
        require(_vestingRewardRatio <= 100, "VestingRewardRatio_percent must be <= 100");
        vestingRewardRatio_percent = _vestingRewardRatio;

        emit VestingRewardRatioSet(_vestingRewardRatio);
    }

    function calculateImmediateReward(uint256 reward) private view returns (uint256) {
        return (reward * (HUNDRED_PERCENT - vestingRewardRatio_percent)) / HUNDRED_PERCENT;
    }

    function releaseReward(
        address to,
        uint256 rewardToRelease,
        uint256 rewardToVest
    ) private {
        rewardsToken.approve(address(vesting), rewardToVest);
        vesting.schedule(to, rewardToVest);

        rewardsToken.safeTransfer(to, rewardToRelease);
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryChanged(_treasury);
    }

    function setVesting(address _vesting) external onlyOwner {
        vesting = Vesting(_vesting);
        emit VestingChanged(_vesting);
    }

    function setRewardFee_d12(uint256 _rewardFee_d12) external onlyOwner {
        require(_rewardFee_d12 <= MAX_REWARD_FEE, "Reward fee cannot exceed 100%");
        rewardFee_d12 = _rewardFee_d12;
        emit RewardFeeChanged(_rewardFee_d12);
    }

    modifier onlyStakingRewards() {
        require(stakingRewardsWeights[msg.sender] > 0, "Only registered staking rewards contracts allowed");
        _;
    }

    function toggleCollectingPaused() external onlyOwner {
        collectingPaused = !collectingPaused;

        emit CollectingPausedToggled(collectingPaused);
    }

    modifier collectingNotPaused() {
        require(collectingPaused == false, "Collecting is paused");
        _;
    }

    // ---------- EVENTS ----------
    event PoolRemoved(address indexed pool);
    event PoolRegistered(address indexed stakingRewardsAddress, uint256 indexed stakingRewardsWeight);
    event VestingRewardRatioSet(uint256 vestingRewardRatio_percent);
    event TreasuryChanged(address newTreasury);
    event VestingChanged(address newVesting);
    event RewardFeeChanged(uint256 newRewardFee_d12);
    event CollectingPausedToggled(bool toggled);
}
