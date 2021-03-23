pragma solidity 0.6.11;

import "../Common/Ownable.sol";
import "../ERC20/SafeERC20.sol";
import "../ERC20/IERC20.sol";
import "../ERC20/SafeERC20.sol";
import "../Math/SafeMath.sol";
import "../FXS/BDXShares.sol";

// based on sushiswap MasterChef
contract LiquidityRewardsManager is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of BDXs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accBdxPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accBdxPerShare` (and `lastRewardTimestamp`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each liquidity pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        
        // How many allocation points assigned to this pool.
        // How many BDXs to distribute per block.
        // The larger the pool (cap), the more AP it gets
        uint256 allocPoint;
        uint256 lastRewardTimestamp; // Last block number that BDXs distribution occurs.
        
        //todo ag now why multiplied by 1e12? pool precision?
        // Accumulated BDXs per share, times 1e12.
        // Used to calculate BDX reward for a user depositing X of LP tokens
        // Before user deposits LP tokens, pending BDX is minted, to reflect the amount of LP tokens in pool
        // This tells us how many BDX we should reward the user for every LP token then deposit
        uint256 accBdxPerShare;
    }

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    
    // The BDX TOKEN!
    BDXShares public bdx;

    // Liquidity Pools registry
    PoolInfo[] public poolInfo;

    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    // used to determine a pool share in minting BDX (denominator)
    uint public totalAllocPoint = 0;

    uint256 public constant TOTAL_LPs_BDX_SUPPLY = 10500000; // todo ag now very little bdx minted every minute ~20 on average

    // BDX minting schedule
    uint256 public constant MINTING_SCHEDULE_PRECISON = 1000;
    uint256 public immutable MINTING_SCHEDULE_YEAR_1 = TOTAL_LPs_BDX_SUPPLY.mul(200).div(MINTING_SCHEDULE_PRECISON);
    uint256 public immutable MINTING_SCHEDULE_YEAR_2 = TOTAL_LPs_BDX_SUPPLY.mul(125).div(MINTING_SCHEDULE_PRECISON);
    uint256 public immutable MINTING_SCHEDULE_YEAR_3 = TOTAL_LPs_BDX_SUPPLY.mul(100).div(MINTING_SCHEDULE_PRECISON);
    uint256 public immutable MINTING_SCHEDULE_YEAR_4 = TOTAL_LPs_BDX_SUPPLY.mul(50).div(MINTING_SCHEDULE_PRECISON);
    uint256 public immutable MINTING_SCHEDULE_YEAR_5 = TOTAL_LPs_BDX_SUPPLY.mul(25).div(MINTING_SCHEDULE_PRECISON);

    uint256 private immutable DeploymentTimestamp;
    uint256 private immutable EndOfYear_1;
    uint256 private immutable EndOfYear_2;
    uint256 private immutable EndOfYear_3;
    uint256 private immutable EndOfYear_4;
    uint256 private immutable EndOfYear_5;

    constructor(
        BDXShares _bdx,
        uint256 _deploymentTimestamp
    ) public {
        bdx = _bdx;

        DeploymentTimestamp = _deploymentTimestamp;

        EndOfYear_1 = _deploymentTimestamp + 365 days;
        EndOfYear_2 = _deploymentTimestamp + 2 * 365 days;
        EndOfYear_3 = _deploymentTimestamp + 3 * 365 days;
        EndOfYear_4 = _deploymentTimestamp + 4 * 365 days;
        EndOfYear_5 = _deploymentTimestamp + 5 * 365 days;
    }

    function getBdxPerMinute() public view returns (uint256)
    {
        uint256 yearSchedule = 0;
        if(block.timestamp < EndOfYear_1){
            yearSchedule = MINTING_SCHEDULE_YEAR_1;
        } else if(block.timestamp < EndOfYear_2){
            yearSchedule = MINTING_SCHEDULE_YEAR_2;
        } else if(block.timestamp < EndOfYear_3){
            yearSchedule = MINTING_SCHEDULE_YEAR_3;
        } else if(block.timestamp < EndOfYear_4){
            yearSchedule = MINTING_SCHEDULE_YEAR_4;
        } else if(block.timestamp < EndOfYear_5){
            yearSchedule = MINTING_SCHEDULE_YEAR_5;
        } else {
            yearSchedule = 0;
        }

        uint256 bdxPerMinute = yearSchedule.div(365*24*60);
        
        //todo ag now use .mul(1e12)?
        return bdxPerMinute;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(
        uint256 _allocPoint,
        IERC20 _lpToken
    ) public onlyOwner {
        uint256 lastRewardTimestamp = block.timestamp;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardTimestamp: lastRewardTimestamp,
                accBdxPerShare: 0
            })
        );
    }

    // Update the given pool's BDX allocation point. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(
            _allocPoint
        );
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.timestamp <= pool.lastRewardTimestamp) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardTimestamp = block.timestamp;
            return;
        }
        uint256 bdxPerMinute = getBdxPerMinute();
        uint256 minutesSinceLastReward = (pool.lastRewardTimestamp - block.timestamp).div(60);

        uint256 bdxReward = minutesSinceLastReward.mul(bdxPerMinute).mul(pool.allocPoint).div(totalAllocPoint);
        
        //todo ag mint bonus for FRAX developers?
        //todo ag limit by total bdx supply
        //   - limit is set by allocPoints 
        bdx.mint(address(this), bdxReward);
        pool.accBdxPerShare = pool.accBdxPerShare.add(
            // todo ag now why mul 1e12?
            bdxReward.mul(1e12).div(lpSupply) // div by lpSupply, because it's "per share" (per LP token)
        );
        pool.lastRewardTimestamp = block.timestamp;
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe BDX transfer function, just in case if rounding error causes pool to not have enough BDXs.
    function safeBdxTransfer(address _to, uint256 _amount) internal {
        uint256 bdxBal = bdx.balanceOf(address(this));
        if (_amount > bdxBal) {
            bdx.transfer(_to, bdxBal);
        } else {
            bdx.transfer(_to, _amount);
        }
    }

    // We reward the PREVIOUS deposit to save gas
    // Steps:
    //    - user.rewardDebt = user.amount.mul(pool.accBdxPerShare).div(1e12);
    //        - during previous depoist or withtrawal
    //    - updatePool
    //        - pending BDX is minted
    //        - pool.accBdxPerShare is updated
    //    - _user.amount.mul(_pool.accBdxPerShare).div(1e12).sub(_user.rewardDebt);
    //        - this is our reward
    //        - user.amount didn't change since last deposit
    //        - so basically our reward is proportional to:
    //            - _pool.accBdxPerShare change since last deposit
    //            - user.amount since last deposit
    function rewardPreviousDeposit(uint256 _pid) private {
        updatePool(_pid);

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        if (user.amount > 0) {
            uint256 pending =
                user.amount.mul(pool.accBdxPerShare).div(1e12).sub(
                    user.rewardDebt
                );
            safeBdxTransfer(msg.sender, pending);
        }
    }

    // Deposit LP tokens to LiquidityRewardsManager for BDX allocation.
    function deposit(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid]; //todo ag why storage?
        UserInfo storage user = userInfo[_pid][msg.sender];

        rewardPreviousDeposit(_pid);

        pool.lpToken.safeTransferFrom(
            address(msg.sender),
            address(this),
            _amount
        );

        user.amount = user.amount.add(_amount);
        user.rewardDebt = user.amount.mul(pool.accBdxPerShare).div(1e12);
        
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from LiquidityRewardsManager.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: insufficient user balance");

        rewardPreviousDeposit(_pid);
        
        user.amount = user.amount.sub(_amount);
        user.rewardDebt = user.amount.mul(pool.accBdxPerShare).div(1e12);
        
        pool.lpToken.safeTransfer(address(msg.sender), _amount);

        emit Withdraw(msg.sender, _pid, _amount);
    }
}