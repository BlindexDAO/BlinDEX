// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../Bdx/BDXShares.sol";
import "./Vesting.sol";

contract StakingRewardsDistribution is OwnableUpgradeable {
    using SafeMath for uint256;
    using SafeERC20 for BDXShares;

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

    function registerPools(address[] calldata _stakingRewardsAddresses, uint[] calldata _stakingRewardsWeights) external onlyByOwner {
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

    function resetRewardsWeights() external onlyByOwner {
        for(uint i = 0; i < stakingRewardsAddresses.length; i++){
            stakingRewardsWeights[stakingRewardsAddresses[i]] = 0;
        }

        stakingRewardsWeightsTotal = 0;

        delete stakingRewardsAddresses;

        emit RewardsWeightsReset();
    }

    function releaseReward(address to, uint256 reward) external onlyStakingRewards returns(uint256 immediatelyReleasedReward) {
        immediatelyReleasedReward = reward.mul(HUNDRED_PERCENT.sub(vestingRewardRatio_percent)).div(HUNDRED_PERCENT);
        uint256 vestedReward = reward.sub(immediatelyReleasedReward);

        rewardsToken.approve(address(vesting), vestedReward);
        vesting.schedule(to, vestedReward);

        rewardsToken.safeTransfer(to, immediatelyReleasedReward);
    }

    function setVestingRewardRatio(uint256 _vestingRewardRatio) external onlyByOwner {
        require(0 <= _vestingRewardRatio && _vestingRewardRatio <= 100, "vestingRewardRatio should be expressed as percent");
        vestingRewardRatio_percent = _vestingRewardRatio;
    }

    modifier onlyStakingRewards() {
        require(stakingRewardsWeights[msg.sender] > 0, "Only registered staking rewards contracts allowed");
        _;
    }

    modifier onlyByOwner() {
        require(msg.sender == owner(), "You are not the owner");
        _;
    }

    // ---------- EVENTS ----------
    event RewardsWeightsReset();
    event PoolRegistered(address stakingRewardsAddress, uint stakingRewardsWeight);
}
