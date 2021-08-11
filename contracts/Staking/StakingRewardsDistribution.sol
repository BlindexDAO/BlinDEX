// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

import "../Math/Math.sol";
import "../Math/SafeMath.sol";
import "../ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "hardhat/console.sol";

contract StakingRewardsDistribution is OwnableUpgradeable {
    using SafeMath for uint256;

    uint256 public constant TOTAL_BDX_SUPPLY = 21000000;
    uint256 private constant ERC20_PRCISON = 1e18;

    bool isInitialized;

    // BDX minting schedule
    // They sum up to 50% of TOTAL_BDX_SUPPLY
    //   as this much is reserved for liquidity mining rewards
    uint256 public constant BDX_MINTING_SCHEDULE_PRECISON = 1000;
    uint256 public BDX_MINTING_SCHEDULE_YEAR_1;
    uint256 public BDX_MINTING_SCHEDULE_YEAR_2;
    uint256 public BDX_MINTING_SCHEDULE_YEAR_3;
    uint256 public BDX_MINTING_SCHEDULE_YEAR_4;
    uint256 public BDX_MINTING_SCHEDULE_YEAR_5;

    uint256 private EndOfYear_1;
    uint256 private EndOfYear_2;
    uint256 private EndOfYear_3;
    uint256 private EndOfYear_4;
    uint256 private EndOfYear_5;

    address public timelock_address;
    ERC20 rewardsToken;

    mapping(address => uint256) public stakingRewardsWeights;
    address[] public stakingRewardsAddresses;
    uint256 public stakingRewardsWeightsTotal;

    function initialize(address _timelock_address, address _rewardsToken) external initializer {
        require(!isInitialized, "contract can be initialized once only");
        __Ownable_init();

        timelock_address = _timelock_address;
        rewardsToken = ERC20(_rewardsToken);

        BDX_MINTING_SCHEDULE_YEAR_1 = TOTAL_BDX_SUPPLY.mul(ERC20_PRCISON).mul(200).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_2 = TOTAL_BDX_SUPPLY.mul(ERC20_PRCISON).mul(125).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_3 = TOTAL_BDX_SUPPLY.mul(ERC20_PRCISON).mul(100).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_4 = TOTAL_BDX_SUPPLY.mul(ERC20_PRCISON).mul(50).div(BDX_MINTING_SCHEDULE_PRECISON);
        BDX_MINTING_SCHEDULE_YEAR_5 = TOTAL_BDX_SUPPLY.mul(ERC20_PRCISON).mul(25).div(BDX_MINTING_SCHEDULE_PRECISON);

        EndOfYear_1 = block.timestamp + 365 days;
        EndOfYear_2 = block.timestamp + 2 * 365 days;
        EndOfYear_3 = block.timestamp + 3 * 365 days;
        EndOfYear_4 = block.timestamp + 4 * 365 days;
        EndOfYear_5 = block.timestamp + 5 * 365 days;
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

        uint256 bdxPerSecond = yearSchedule.div(365*24*60*60).mul(stakingRewardsWeights[_stakingRewardsAddress]).div(stakingRewardsWeightsTotal);

        return bdxPerSecond;
    }

    function registerPools(address[] calldata _stakingRewardsAddresses, uint[] calldata _stakingRewardsWeights) external onlyByOwnerOrGovernance {
        require(_stakingRewardsAddresses.length == _stakingRewardsWeights.length, "Pools addresses and weights lengths should be the same");

        for(uint i = 0; i < _stakingRewardsAddresses.length; i++){
            if(stakingRewardsWeights[_stakingRewardsAddresses[i]] == 0) { // to avoid duplicates
                stakingRewardsAddresses.push(_stakingRewardsAddresses[i]);
            }

            stakingRewardsWeightsTotal -= stakingRewardsWeights[_stakingRewardsAddresses[i]]; // to support override
            stakingRewardsWeights[_stakingRewardsAddresses[i]] = _stakingRewardsWeights[i];
            stakingRewardsWeightsTotal += _stakingRewardsWeights[i];
        }

        emit PoolsRegistered(_stakingRewardsAddresses, _stakingRewardsWeights);
    }

    function resetRewardsWeights() external onlyByOwnerOrGovernance {
        for(uint i = 0; i < stakingRewardsAddresses.length; i++){
            stakingRewardsWeights[stakingRewardsAddresses[i]] = 0;
        }

        stakingRewardsWeightsTotal = 0;

        delete stakingRewardsAddresses;

        emit RewardsWeightsReset();
    }

    function transferRewards(address _recepient, uint256 amountErc20) external onlyStakingRewards {
        rewardsToken.transfer(_recepient, amountErc20);
    }

    modifier onlyStakingRewards() {
        require(stakingRewardsWeights[msg.sender] > 0, "Only registered staking rewards contracts allowed");
        _;
    }

    modifier onlyByOwnerOrGovernance() {
        require(msg.sender == owner() || msg.sender == timelock_address, "You are not the owner or the governance timelock");
        _;
    }

    // ---------- EVENTS ----------
    event RewardsWeightsReset();
    event PoolsRegistered(address[] indexed stakingRewardsAddresses, uint[] indexed stakingRewardsWeights);
}