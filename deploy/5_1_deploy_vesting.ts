import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { BDXShares } from '../typechain/BDXShares';
import { StakingRewardsDistribution } from '../typechain/StakingRewardsDistribution';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const deployer = (await hre.getNamedAccounts()).DEPLOYER;
    const bdx = await hre.ethers.getContract("BDXShares") as BDXShares;
    const stakingRewardsDistribution = await hre.ethers.getContract("StakingRewardsDistribution") as StakingRewardsDistribution;
    const vestingTimeInSeconds = 60 * 60 * 24 * 30 * 9 //9 months

    const vesting_ProxyDeployment = await hre.deployments.deploy(
        'Vesting',
        {
            from: deployer,
            proxy: {
                proxyContract: 'OptimizedTransparentProxy',
                execute: {
                    init: {
                        methodName: "initialize",
                        args: [
                            bdx.address,
                            deployer,
                            stakingRewardsDistribution.address,
                            vestingTimeInSeconds
                        ]
                    }
                }
            },
            contract: "Vesting",
            args: []
        }
    );
    
    console.log("Deployed Vesting");

    return true;
}

func.id = __filename
func.tags = ['Vesting'];
func.dependencies = ['BDX', 'StakingRewardsDistribution'];
export default func;