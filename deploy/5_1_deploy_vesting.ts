import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { BDXShares } from '../typechain/BDXShares';
import { StakingRewardsDistribution } from '../typechain/StakingRewardsDistribution';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    console.log("starting deployment: vesting");

    const deployerAddres = (await hre.getNamedAccounts()).DEPLOYER;
    const bdx = await hre.ethers.getContract("BDXShares") as BDXShares;
    const vestingTimeInSeconds = 60 * 60 * 24 * 30 * 9 //9 months

    const vesting_ProxyDeployment = await hre.deployments.deploy(
        'Vesting',
        {
            from: deployerAddres,
            proxy: {
                proxyContract: 'OptimizedTransparentProxy',
                execute: {
                    init: {
                        methodName: "initialize",
                        args: [
                            bdx.address,
                            deployerAddres,
                            deployerAddres,
                            vestingTimeInSeconds
                        ]
                    }
                }
            },
            contract: "Vesting",
            args: []
        }
    );
    
    console.log("Vesting deployed to: " + vesting_ProxyDeployment.address);

    console.log("finished deployment: vesting");

    return true;
}

func.id = __filename
func.tags = ['Vesting'];
func.dependencies = ['BDX'];
export default func;