// SPDX-License-Identifier: MIT
pragma experimental ABIEncoderV2;
pragma solidity 0.6.11;
// file: BDLens.sol

import "hardhat/console.sol";
import "../Frax/BDStable.sol";
import "../Staking/StakingRewards.sol";

// used to "waste" blocks for truffle tests
contract BDLens {
    address public BDX;
    address public SwapFactory;
    address public SwapRouter;
    address public StakingRewardsDistribution;
    address[] public BdStables;
    address[] public Stakings;

    constructor() public {
    }

    function setBDX(address _bdx) public {
        BDX = _bdx;
    }

    function setSwapFactory(address _swapFactory) public {
        SwapFactory = _swapFactory;
    }

    function setSwapRouter(address _swapRouter) public {
        SwapRouter = _swapRouter;
    }

    function setStakingRewardsDistribution(address _stakingRewardsDistribution) public {
        StakingRewardsDistribution = _stakingRewardsDistribution;
    }

    function pushBdStable(address _bdstable) public {
        BdStables.push(_bdstable);
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
            console.log(BdStables[i]);
            infos[i] = (BdStableInfo(BDStable(BdStables[i]).fiat(), BdStables[i]));
        }
        return infos;
    }
    function pushStaking(address _staking) public {
        console.log(_staking);
        Stakings.push(_staking);
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
            console.log(Stakings[i]);
            infos[i] = (StakingInfo(address(StakingRewards(Stakings[i]).stakingToken()), Stakings[i]));
        }
        return infos;
    }
    
}
