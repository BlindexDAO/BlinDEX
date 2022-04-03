// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./StakingRewardsDistribution.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract Vesting is OwnableUpgradeable {
    using SafeERC20 for IERC20;

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
    ) external initializer {
        require(_vestedTokenAddress != address(0), "Vesting address cannot be 0");
        require(_vestingScheduler != address(0), "VestingScheduler address cannot be 0");
        require(_fundsProvider != address(0), "FundsProvider address cannot be 0");
        require(_vestingTimeInSeconds > 0, "Vesting timme cannot be set to 0");

        __Ownable_init();

        vestedToken = IERC20(_vestedTokenAddress);
        vestingScheduler = _vestingScheduler;
        fundsProvider = _fundsProvider;
        vestingTimeInSeconds = _vestingTimeInSeconds;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function schedule(address _receiver, uint256 _amount_d18) external {
        // to prevent melicious users form cloging user's schedules
        require(msg.sender == vestingScheduler, "Only vesting scheduler can create vesting schedules");

        vestingSchedules[_receiver].push(VestingSchedule(block.timestamp, block.timestamp + vestingTimeInSeconds, _amount_d18, 0));

        vestedToken.safeTransferFrom(fundsProvider, address(this), _amount_d18);

        emit ScheduleCreated(_receiver, _amount_d18);
    }

    function claim(uint256 from, uint256 to) external {
        require(from < to, "Vesting: 'to' must be larger than 'from'");
        VestingSchedule[] storage userVestingSchedules = vestingSchedules[msg.sender];

        uint256 rewardsToClaim = 0;
        uint256 userVestingSchedulesLength = userVestingSchedules.length;

        for (uint256 index = from + 1; index <= to && index <= userVestingSchedulesLength; ++index) {
            if (isFullyVested(userVestingSchedules[index - 1])) {
                rewardsToClaim =
                    rewardsToClaim +
                    userVestingSchedules[index - 1].totalVestedAmount_d18 -
                    userVestingSchedules[index - 1].releasedAmount_d18;

                --userVestingSchedulesLength;
                userVestingSchedules[index - 1] = userVestingSchedules[userVestingSchedulesLength];
                userVestingSchedules.pop();

                --index;
            } else {
                uint256 proprtionalReward = getAvailableReward(userVestingSchedules[index - 1]);
                rewardsToClaim = rewardsToClaim + proprtionalReward;
                userVestingSchedules[index - 1].releasedAmount_d18 = userVestingSchedules[index - 1].releasedAmount_d18 + proprtionalReward;
            }
        }

        vestedToken.safeTransfer(msg.sender, rewardsToClaim);

        emit RewardClaimed(msg.sender, rewardsToClaim);
    }

    /* ========== VIEWS ========== */

    function userVestingSchedulesCount(address user) external view returns (uint256) {
        return vestingSchedules[user].length;
    }

    function isFullyVested(VestingSchedule memory _schedule) public view returns (bool) {
        return _schedule.vestingEndTimeStamp <= block.timestamp;
    }

    function getAvailableReward(VestingSchedule memory _schedule) public view returns (uint256) {
        if (isFullyVested(_schedule)) {
            return _schedule.totalVestedAmount_d18 - _schedule.releasedAmount_d18;
        }
        return
            ((_schedule.totalVestedAmount_d18 * (block.timestamp - _schedule.vestingStartedTimeStamp)) / vestingTimeInSeconds) -
            _schedule.releasedAmount_d18;
    }

    function vestingSchedulesOf(address account) external view returns (VestingSchedule[] memory) {
        return vestingSchedules[account];
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setVestingScheduler(address _vestingScheduler) external onlyOwner {
        require(_vestingScheduler != address(0), "Vesting scheduler cannot be set to the zero address");

        vestingScheduler = _vestingScheduler;
    }

    function setVestingTimeInSeconds(uint256 _vestingTimeInSeconds) external onlyOwner {
        require(_vestingTimeInSeconds > 0, "Vesting timme cannot be set to 0");
        vestingTimeInSeconds = _vestingTimeInSeconds;

        emit VestingTimeInSecondsSet(_vestingTimeInSeconds);
    }

    function setFundsProvider(address _fundsProvider) external onlyOwner {
        require(_fundsProvider != address(0), "Funds provider cannot be set to the zero address");

        fundsProvider = _fundsProvider;
    }

    event ScheduleCreated(address user, uint256 amount);
    event RewardClaimed(address user, uint256 amount);
    event VestingTimeInSecondsSet(uint256 vestingTimeInSeconds);
}
