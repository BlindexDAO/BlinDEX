// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

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
    address fundsProvider;
    uint256 public vestingTimeInSeconds;

    ERC20 private vestedToken;

    function initialize(
        address _vestedTokenAddress,
        address _vestingScheduler,
        address _fundsProvider,
        uint256 _vestingTimeInSeconds
    ) 
        external
        initializer
    {
        __Ownable_init();

        vestedToken = ERC20(_vestedTokenAddress);
        vestingScheduler = _vestingScheduler;
        fundsProvider = _fundsProvider;
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

        TransferHelper.safeTransferFrom(address(vestedToken), fundsProvider, address(this), _amount_d18);

        emit ScheduleCreated(_receiver, _amount_d18);
    }

    function claim() external {
        VestingSchedule[] storage userVestingSchedules = vestingSchedules[msg.sender];
        uint256 rewardsToClaim = 0;
        for (uint256 i = 0; i < userVestingSchedules.length; i++) {
            if (isFullyVested(userVestingSchedules[i])) {
                rewardsToClaim = rewardsToClaim.add(userVestingSchedules[i].totalVestedAmount_d18.sub(userVestingSchedules[i].releasedAmount_d18));
                delete userVestingSchedules[i];
            } else {
                uint256 proprtionalReward = getAvailableReward(userVestingSchedules[i]);
                rewardsToClaim = rewardsToClaim.add(proprtionalReward);
                userVestingSchedules[i].releasedAmount_d18 = userVestingSchedules[i].releasedAmount_d18.add(proprtionalReward);
            }
        }

        TransferHelper.safeTransfer(address(vestedToken), msg.sender, rewardsToClaim);

        emit RewardClaimed(msg.sender, rewardsToClaim);
    }

    function isFullyVested(VestingSchedule memory _schedule) internal view returns(bool) {
        return _schedule.vestingStartedTimeStamp.add(vestingTimeInSeconds) <= block.timestamp;
    }

    function getAvailableReward(VestingSchedule memory _schedule) internal view returns(uint256) {
        return (_schedule.totalVestedAmount_d18
            .mul(block.timestamp.sub(_schedule.vestingStartedTimeStamp))
            .div(vestingTimeInSeconds)
        )
        .sub(_schedule.releasedAmount_d18);
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

    function setFundsProvider(address _fundsProvider) external onlyByOwner {
        fundsProvider = _fundsProvider;
    }

    modifier onlyByOwner() {
        require(msg.sender == owner(),  "You are not the owner");
        _;
    }

    event ScheduleCreated(address user, uint256 amount);
    event RewardClaimed(address user, uint256 amount);
}