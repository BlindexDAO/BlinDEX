import { task } from "hardhat/config";
import { getWeth, mintWbtc } from "../utils/DeployedContractsHelpers";
import { to_d18 } from "../utils/NumbersHelpers";
import { setUpFunctionalSystem, setUpMinimalFunctionalSystem } from "../utils/SystemSetup";

export function load() {
    task("initialize")
        .setAction(async (args, hre) => {
            await setUpFunctionalSystem(hre, 1, false);
        });

    task("initialize:local")
        .setAction(async (args, hre) => {
            const weth = await getWeth(hre);
            const deployer = await hre.ethers.getNamedSigner('DEPLOYER');

            // mint initial WETH
            await weth.deposit({ value: to_d18(100) });
            // mint inital WBTC
            await mintWbtc(hre, deployer, to_d18(1000));

            await setUpFunctionalSystem(hre, 1, false);
        });

    task("initialize:min")
        .setAction(async (args, hre) => {
            await setUpMinimalFunctionalSystem(hre);
        });

    task("initialize:min:local")
        .setAction(async (args, hre) => {
            const weth = await getWeth(hre);
            const deployer = await hre.ethers.getNamedSigner('DEPLOYER');

            // mint initial WETH
            await weth.deposit({ value: to_d18(1) });
            // mint inital WBTC
            await mintWbtc(hre, deployer, to_d18(1));

            await setUpMinimalFunctionalSystem(hre);
        });
}