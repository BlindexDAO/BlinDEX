// SPDX-License-Identifier: MIT
pragma experimental ABIEncoderV2;
pragma solidity 0.6.11;
// file: BDLens.sol

import "../BdStable/BDStable.sol";
import "../Staking/StakingRewards.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// used to "waste" blocks for truffle tests
contract BDLens is OwnableUpgradeable {
    address public BDX;
    address public SwapFactory;
    address public SwapRouter;
    address public StakingRewardsDistribution;
    address public Vesting;
    address[] public BdStables;
    address[] public Stakings;
    address public PriceFeed_EUR_USD;

    string public nativeTokenName;

    function initialize(string memory _nativeTokenName) 
        public
        initializer
    {
        nativeTokenName = _nativeTokenName;
        __Ownable_init();
    }

    function setBDX(address _bdx)
        external
        onlyByOwner
    {
        BDX = _bdx;
    }

    function setSwapFactory(address _swapFactory)
        external
        onlyByOwner
    {
        SwapFactory = _swapFactory;
    }

    function setSwapRouter(address _swapRouter)
        external
        onlyByOwner
    {
        SwapRouter = _swapRouter;
    }

    function setStakingRewardsDistribution(address _stakingRewardsDistribution)
        external
        onlyByOwner
    {
        StakingRewardsDistribution = _stakingRewardsDistribution;
    }

    function setVesting(address _vesting)
    external
    onlyByOwner
    {
        Vesting = _vesting;
    }

    function pushBdStable(address _bdstable)
        external
        onlyByOwner
    {
        BdStables.push(_bdstable);
    }

    function pushStaking(address _staking)
        external
        onlyByOwner
    {
        Stakings.push(_staking);
    }

    function setPriceFeed_EUR_USD(address feed)
        external
        onlyByOwner
    {
        PriceFeed_EUR_USD = feed;
    }

    function deleteFromBdStables(address _bdStable)
        external
        onlyByOwner
    {
        for (uint i = 0; i < BdStables.length; i++) {
            if (BdStables[i] == _bdStable) {
                BdStables[i] = BdStables[BdStables.length - 1];
                BdStables.pop();
                return;
            }
        }
    }

    function deleteFromStakings(address _stakings)
        external
        onlyByOwner
    {
        for (uint i = 0; i < Stakings.length; i++) {
            if (Stakings[i] == _stakings) {
                Stakings[i] = Stakings[Stakings.length - 1];
                Stakings.pop();
                return;
            }
        }
    }

    function BdStablesLength() public view returns (uint256) {
        return BdStables.length;
    }

    struct BdStableInfo {
        string fiat;
        address token;
    }

    function AllBdStables() external view returns (BdStableInfo[] memory) {
        BdStableInfo[] memory infos = new BdStableInfo[](BdStables.length);
        for(uint i = 0; i < BdStables.length; i++) {
            infos[i] = (BdStableInfo(BDStable(BdStables[i]).fiat(), BdStables[i]));
        }
        return infos;
    }

    function StakingsLength() public view returns (uint256) {
        return Stakings.length;
    }

    struct StakingInfo {
        address lp;
        address token;
    }

    function AllStakings() external view returns (StakingInfo[] memory) {
        StakingInfo[] memory infos = new StakingInfo[](Stakings.length);
        for(uint i = 0; i < Stakings.length; i++) {
            infos[i] = (StakingInfo(address(StakingRewards(Stakings[i]).stakingToken()), Stakings[i]));
        }
        return infos;
    }

    modifier onlyByOwner() {
        require(msg.sender == owner(),  "You are not the owner");
        _;
    }   
}
