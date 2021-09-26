pragma solidity 0.6.11;

import "../Math/Math.sol";
import "../Math/SafeMath.sol";
import "../ERC20/ERC20.sol";
import '../Uniswap/TransferHelper.sol';
import "../ERC20/SafeERC20.sol";
import "./StakingRewardsDistribution.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Inheritance
import "hardhat/console.sol";

contract Vesting is OwnableUpgradeable
{
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    struct VestingSchedule {
        uint256 vestingStartedTimeStamp;
        uint256 totalVestedAmount_d18;
        uint256 releasedAmount_d18;
    }

    mapping(address => VestingSchedule[]) public vestingSchedules;
    
    address vestingScheduler;
    address stakingRewardsDistribution;
    uint256 vestingTimeInSeconds;

    ERC20 private vestedToken;

    function initialize(
        address _vestedTokenAddress,
        address _vestingScheduler,
        address _stakingRewardsDistribution,
        uint256 _vestingTimeInSeconds
    ) 
        external
        initializer
    {
        __Ownable_init();

        vestedToken = ERC20(_vestedTokenAddress);
        vestingScheduler = _vestingScheduler;
        stakingRewardsDistribution = _stakingRewardsDistribution;
        vestingTimeInSeconds = _vestingTimeInSeconds;
    }

    function schedule(address _receiver, uint256 _amount_d18) external {
        // to prevent melicious users form cloging user's schedules
        require(msg.sender == vestingScheduler,
            "Only vesting scheduler can create vesting schedules");

        vestingSchedules[_receiver].push(VestingSchedule(
            block.timestamp,
            _amount_d18,
            0
        ));

        TransferHelper.safeTransferFrom(address(vestedToken), stakingRewardsDistribution, address(this), _amount_d18);
    }

    function claim() external {
        VestingSchedule[] memory vestingSchedules = vestingSchedules[msg.sender];
        uint256 rewardsToClaim = 0;
        for (uint256 i = 0; i < vestingSchedules.length; i++) {
            VestingSchedule memory schedule = vestingSchedules[i];
            if (isFullyVested(schedule)) {
                rewardsToClaim += schedule.totalVestedAmount_d18 - schedule.releasedAmount_d18;
            } else {
                uint256 prooprtionalReward = getProportionalReward(schedule);
                rewardsToClaim += prooprtionalReward;
                schedule.releasedAmount_d18 += prooprtionalReward;
            }
        }

        //delete used stakes

        TransferHelper.safeTransfer(address(vestedToken), msg.sender, rewardsToClaim);
    }

    function isFullyVested(VestingSchedule memory schedule) returns(bool) {
        return schedule.vestingStartedTimeStamp + vestingTimeInSeconds <= block.timestamp;
    }

    function getProportionalReward(VestingSchedule memory schedule) returns(uint256) {
        uint256 remainingReward_d18 = schedule.totalVestedAmount_d18 - schedule.releasedAmount_d18;
        return remainingReward_d18 * (block.timestamp - schedule.vestingStartedTimeStamp) / vestingTimeInSeconds;
    }

    function setVestingScheduler(address _vestingScheduler)
        external
        onlyByOwner
    {
        vestingScheduler = _vestingScheduler;
    }

    function setVestingTimeInSeconds(uint256 _vestingTimeInSeconds)
        external
        onlyByOwner
    {
        vestingTimeInSeconds = _vestingTimeInSeconds;
    }

    modifier onlyByOwner() {
        require(msg.sender == owner(),  "You are not the owner");
        _;
    }
}