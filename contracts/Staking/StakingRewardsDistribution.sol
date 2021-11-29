// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../Bdx/BDXShares.sol";
import "./Vesting.sol";
import "./StakingRewards.sol";

contract StakingRewardsDistribution is OwnableUpgradeable {
    using SafeMath for uint256;
    using SafeERC20Upgradeable for BDXShares;

    uint256 public TOTAL_BDX_SUPPLY;
    
    uint256 public constant HUNDRED_PERCENT = 100;

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

    BDXShares private rewardsToken;
    Vesting private vesting;

    mapping(address => uint256) public stakingRewardsWeights;
    address[] public stakingRewardsAddresses;
    uint256 public stakingRewardsWeightsTotal;

    function initialize(
        address _rewardsToken,
        address _vesting,
        uint256 _vestingRewardRatio_percent
    ) external initializer {
        __Ownable_init();

        rewardsToken = BDXShares(_rewardsToken);
        vesting = Vesting(_vesting);
        TOTAL_BDX_SUPPLY = rewardsToken.MAX_TOTAL_SUPPLY();

        BDX_MINTING_SCHEDULE_YEAR_1 = TOTAL_BDX_SUPPLY.mul(200).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_2 = TOTAL_BDX_SUPPLY.mul(125).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_3 = TOTAL_BDX_SUPPLY.mul(100).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_4 = TOTAL_BDX_SUPPLY.mul(50).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_5 = TOTAL_BDX_SUPPLY.mul(25).div(BDX_MINTING_SCHEDULE_PRECISON);

        EndOfYear_1 = block.timestamp + 365 days;
        EndOfYear_2 = block.timestamp + 2 * 365 days;
        EndOfYear_3 = block.timestamp + 3 * 365 days;
        EndOfYear_4 = block.timestamp + 4 * 365 days;
        EndOfYear_5 = block.timestamp + 5 * 365 days;

        vestingRewardRatio_percent = _vestingRewardRatio_percent;
    }

    // Precision 1e18 for compatibility with ERC20 token
    function getRewardRatePerSecond(address _stakingRewardsAddress) external view returns (uint256) {
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

        uint256 bdxPerSecond = yearSchedule.mul(stakingRewardsWeights[_stakingRewardsAddress]).div(365*24*60*60).div(stakingRewardsWeightsTotal);

        return bdxPerSecond;
    }

    function registerPools(address[] calldata _stakingRewardsAddresses, uint[] calldata _stakingRewardsWeights) external onlyOwner {
        require(_stakingRewardsAddresses.length == _stakingRewardsWeights.length, "Pools addresses and weights lengths should be the same");

        for(uint i = 0; i < _stakingRewardsAddresses.length; i++){
            if(stakingRewardsWeights[_stakingRewardsAddresses[i]] == 0) { // to avoid duplicates
                stakingRewardsAddresses.push(_stakingRewardsAddresses[i]);
            }

            stakingRewardsWeightsTotal -= stakingRewardsWeights[_stakingRewardsAddresses[i]]; // to support override
            stakingRewardsWeights[_stakingRewardsAddresses[i]] = _stakingRewardsWeights[i];
            stakingRewardsWeightsTotal += _stakingRewardsWeights[i];
            emit PoolRegistered(_stakingRewardsAddresses[i], _stakingRewardsWeights[i]);
        }
    }

    function unregisterPool(address pool, uint256 from, uint256 to) external onlyOwner {
        to = to < stakingRewardsAddresses.length
            ? to
            : stakingRewardsAddresses.length;

        stakingRewardsWeightsTotal -= stakingRewardsWeights[pool];
        stakingRewardsWeights[pool] = 0;

        for(uint256 i = from; i < to; i++){
            if(stakingRewardsAddresses[i] == pool){
                stakingRewardsAddresses[i] = stakingRewardsAddresses[stakingRewardsAddresses.length-1];
                stakingRewardsAddresses.pop();

                emit PoolRemoved(pool);
                return;
            }
        }
    }

    function releaseReward(address to, uint256 reward) public onlyStakingRewards returns(uint256 immediatelyReleasedReward) {
        return releaseRewardInternal(to, reward);
    }

    function collectAllRewards(uint256 from, uint256 to) external {
        to = to < stakingRewardsAddresses.length
            ? to
            : stakingRewardsAddresses.length;
        
        uint256 totalReward;
        for(uint i = from; i < to; i++){
            StakingRewards stakingRewards = StakingRewards(stakingRewardsAddresses[i]);

            stakingRewards.updateUserReward(msg.sender);
            uint256 poolReward = stakingRewards.rewards(msg.sender);

            if(poolReward > 0){
                totalReward = totalReward.add(poolReward);

                uint256 immediatelyReleasedReward = calculateImmediateReward(poolReward);
                stakingRewards.onRewardCollected(msg.sender, immediatelyReleasedReward);
            }
        }

        if(totalReward > 0){
            releaseRewardInternal(msg.sender, totalReward);
        }
    }

    function setVestingRewardRatio(uint256 _vestingRewardRatio) external onlyOwner {
        require(_vestingRewardRatio <= 100, "vestingRewardRatio should be expressed as percent");
        vestingRewardRatio_percent = _vestingRewardRatio;

        emit VestingRewardRatioSet(_vestingRewardRatio);
    }

    function calculateImmediateReward(uint256 reward) private view returns(uint256){
        return reward.mul(HUNDRED_PERCENT.sub(vestingRewardRatio_percent)).div(HUNDRED_PERCENT);
    }

    function releaseRewardInternal(address to, uint256 reward) private returns(uint256 immediatelyReleasedReward) {
        immediatelyReleasedReward = calculateImmediateReward(reward);
        uint256 vestedReward = reward.sub(immediatelyReleasedReward);

        rewardsToken.approve(address(vesting), vestedReward);
        vesting.schedule(to, vestedReward);

        rewardsToken.safeTransfer(to, immediatelyReleasedReward);
    }

    modifier onlyStakingRewards() {
        require(stakingRewardsWeights[msg.sender] > 0, "Only registered staking rewards contracts allowed");
        _;
    }

    // ---------- EVENTS ----------
    event PoolRemoved(address indexed pool);
    event PoolRegistered(address indexed stakingRewardsAddress, uint indexed stakingRewardsWeight);
    event VestingRewardRatioSet(uint256 vestingRewardRatio_percent);
}
