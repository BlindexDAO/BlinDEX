import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { getBot, getDeployer, getWethPair, getWethPairOracle } from '../utils/DeployedContractsHelpers'
import { DeployResult } from 'hardhat-deploy/dist/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    console.log("starting deployment: Updater");

    const networkName = hre.network.name;
    const deployer = await getDeployer(hre);
    const bot = await getBot(hre);

    let updater: DeployResult;
    updater = await hre.deployments.deploy('Updater', {
        from: deployer.address,
        contract: "Updater",
        args: [
            bot.address
        ]
    });
    console.log("deployed Updater to: " + updater.address);
    console.log("finished deployment: Updater");

    // One time migration
    return true;
};

func.id = __filename
func.tags = ['Updater'];
func.dependencies = ['SovrynSwapPriceFeed', 'FiatToFiatPseudoOracleFeed', 'UniswapPairOracle', 'BDStable'];
export default func;