pragma solidity 0.6.11;

import "../contracts/Common/Ownable.sol"
import "../contracts/ERC20/SafeERC20.sol"
import "../contracts/ERC20/IERC20.sol"
import "../contracts/ERC20/SafeERC20.sol"
import "../contracts/Math/SafeMath.sol"
import "../contracts/FXS/BDXShares.sol"

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
        //   1. The pool's `accBdxPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each liquidity pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. BDXs to distribute per block.
        uint256 lastRewardBlock; // Last block number that BDXs distribution occurs.
        
        //todo ag now why multiplied by 1e12? pool precision?
        // Accumulated BDXs per share, times 1e12.
        // Used to calculate BDX reward for a user depositing X of LP tokens
        // Before user deposits LP tokens, pending BDX is minted, to reflect the amount of LP tokens in pool
        // This tells us how many BDX we should reward the user for every LP token then deposit
        uint256 accBdxPerShare;
    }

    // The BDX TOKEN!
    BdxShares public bdx;

    // Liquidity Pools registry
    PoolInfo[] public poolInfo;

    uint256 public constant TOTAL_LPs_BDX_SUPPLY = 10500000;

    // BDX minting schedule, multiplied by 1000
    uint256 public constant MINTING_SCHEDULE_PRECISON = 1000;
    uint256 public constant MINTING_SCHEDULE_YEAR_1 = 200;
    uint256 public constant MINTING_SCHEDULE_YEAR_2 = 125;
    uint256 public constant MINTING_SCHEDULE_YEAR_3 = 100;
    uint256 public constant MINTING_SCHEDULE_YEAR_4 = 50;
    uint256 public constant MINTING_SCHEDULE_YEAR_5 = 25;

    // Bonus muliplier for early bdx long term LP providers. multiplied by 1000
    uint256 public constant LOCK_LIQUIDITY_BONUS_MULTIPLIER_PRECISON = 1000;
    uint256 public constant LOCK_LIQUIDITY_BONUS_MULTIPLIER_10_YEARS = 50000;
    uint256 public constant LOCK_LIQUIDITY_BONUS_MULTIPLIER_5_YEARS = 10000;
    uint256 public constant LOCK_LIQUIDITY_BONUS_MULTIPLIER_3_YEARS = 3000;
    uint256 public constant LOCK_LIQUIDITY_BONUS_MULTIPLIER_2_YEARS = 2333;
    uint256 public constant LOCK_LIQUIDITY_BONUS_MULTIPLIER_1_YEARS = 1667;

    // Return BDX per block for given given _from to _to block.
    function getBdxPerBlock(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        uint256 mintingSchedule = MINTING_SCHEDULE_YEAR_1; // todo ag select by year
        uint256 blocksPerYear = 1000; // todo ag
        uint256 bdxPerBlock = TOTAL_LPs_BDX_SUPPLY.mul(mintingSchedule).div(blocksPerYear).div(MINTING_SCHEDULE_PRECISON);  

        return bdxPerBlock;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        uint256 lockLiquiditybonusMultiplier = LOCK_LIQUIDITY_BONUS_MULTIPLIER_5_YEARS; // todo ag select by year, estimated by blocks possibly?
        return _to.sub(_from).mul(lockLiquiditybonusMultiplier).div(LOCK_LIQUIDITY_BONUS_MULTIPLIER_PRECISON); // slight simplification on boundaries
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(
        uint256 _allocPoint,
        IERC20 _lpToken,
    ) public onlyOwner {
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accBdxPerShare: 0
            })
        );
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
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 bdxPerBlock = getBdxPerBlock(pool.lastRewardBlock, block.number);
        uint256 bdxReward =
            multiplier.mul(bdxPerBlock).mul(pool.allocPoint).div( //todo ag now what is pool.allocPoint?
                totalAllocPoint //todo ag now what is totalAllocPoint?
            );
        
        //todo ag mint bonus for FRAX developers?
        //todo ag limit by total bdx supply
        bdx.mint(address(this), bdxReward);
        pool.accBdxPerShare = pool.accBdxPerShare.add(
            bdxReward.mul(1e12).div(lpSupply) // div by lpSupply, because it's "per share" (per LP token)
        );
        pool.lastRewardBlock = block.number;
    }
}