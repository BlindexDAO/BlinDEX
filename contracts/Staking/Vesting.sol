// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./StakingRewardsDistribution.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract Vesting is OwnableUpgradeable
{
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct VestingSchedule {
        uint256 vestingStartedTimeStamp;
        uint256 vestingEndTimeStamp;
        uint256 totalVestedAmount_d18;
        uint256 releasedAmount_d18;
    }

    mapping(address => VestingSchedule[]) public vestingSchedules;
    
    address public vestingScheduler;
    address public fundsProvider;
    uint256 public vestingTimeInSeconds;
    IERC20 public vestedToken;

    function initialize(
        address _vestedTokenAddress,
        address _vestingScheduler,
        address _fundsProvider,
        uint256 _vestingTimeInSeconds
    ) 
        external
        initializer
    {
        require( _vestingTimeInSeconds > 0, "Vesting timme cannot be set to 0");

        __Ownable_init();

        vestedToken = IERC20(_vestedTokenAddress);
        vestingScheduler = _vestingScheduler;
        fundsProvider = _fundsProvider;
        vestingTimeInSeconds = _vestingTimeInSeconds;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function schedule(address _receiver, uint256 _amount_d18) external {
        // to prevent melicious users form cloging user's schedules
        require(msg.sender == vestingScheduler,
            "Only vesting scheduler can create vesting schedules");

        vestingSchedules[_receiver].push(VestingSchedule(
            block.timestamp,
            block.timestamp.add(vestingTimeInSeconds),
            _amount_d18,
            0
        ));

        vestedToken.safeTransferFrom(fundsProvider, address(this), _amount_d18);

        emit ScheduleCreated(_receiver, _amount_d18);
    }

    function claim(uint256 from, uint256 to) external {
        VestingSchedule[] storage userVestingSchedules = vestingSchedules[msg.sender];

        uint256 rewardsToClaim = 0;
        uint256 userVestingSchedulesCount = userVestingSchedules.length;
        for (uint256 i = from; i < to && i < userVestingSchedulesCount; i++) {
            if (isFullyVested(userVestingSchedules[i])) {
                rewardsToClaim = rewardsToClaim.add(userVestingSchedules[i].totalVestedAmount_d18.sub(userVestingSchedules[i].releasedAmount_d18));
                
                userVestingSchedulesCount--;
                userVestingSchedules[i] = userVestingSchedules[userVestingSchedulesCount];
                userVestingSchedules.pop();
                i--;
            } else {
                uint256 proprtionalReward = getAvailableReward(userVestingSchedules[i]);
                rewardsToClaim = rewardsToClaim.add(proprtionalReward);
                userVestingSchedules[i].releasedAmount_d18 = userVestingSchedules[i].releasedAmount_d18.add(proprtionalReward);
            }
        }

        vestedToken.safeTransfer(msg.sender, rewardsToClaim);

        emit RewardClaimed(msg.sender, rewardsToClaim);
    }

    /* ========== VIEWS ========== */

    function userVestingSchedulesCount(address user) external view returns (uint256) {
        return vestingSchedules[user].length;
    }

    function isFullyVested(VestingSchedule memory _schedule) public view returns(bool) {
        return _schedule.vestingEndTimeStamp <= block.timestamp;
    }

    function getAvailableReward(VestingSchedule memory _schedule) public view returns(uint256) {
        if (isFullyVested(_schedule)) {
            return _schedule.totalVestedAmount_d18.sub(_schedule.releasedAmount_d18);
        }
        return (_schedule.totalVestedAmount_d18
            .mul(block.timestamp.sub(_schedule.vestingStartedTimeStamp))
            .div(vestingTimeInSeconds)
        )
        .sub(_schedule.releasedAmount_d18);
    }

    function vestingSchedulesOf(address account) external view returns (VestingSchedule[] memory) {
        return vestingSchedules[account];
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

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
        require( _vestingTimeInSeconds > 0, "Vesting timme cannot be set to 0");
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
