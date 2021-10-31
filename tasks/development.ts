import { task } from "hardhat/config";
import { BigNumber } from 'ethers';
import { getBdEu, getBdx, getDeployer, getWbtc, getWeth, mintWbtc } from "../test/helpers/common";
import { to_d18, to_d8 } from "../utils/Helpers";
import { simulateTimeElapseInSeconds } from "../utils/HelpersHardhat";
import { lockBdEuCrAt } from "../test/helpers/bdStable";
import { ICryptoPairOracle } from "../typechain/ICryptoPairOracle";
import { BtcToEthOracleMoneyOnChain } from "../typechain/BtcToEthOracleMoneyOnChain";
import { BdStablePool } from "../typechain/BdStablePool";
import * as constants from '../utils/Constants'

const fs = require('fs');

export function load() {

    // generl purpose task to run any ad-hoc job
    task("run:job")
        .setAction(async (args, hre) => {
        });

    task("accounts", "Prints the list of accounts", async (args, hre) => {
        const accounts = await hre.ethers.getSigners();

        for (const account of accounts) {
            console.log(account.address);
        }
    });

    task("test:dir")
        .addFlag("deployFixture", 'run the global fixture before tests')
        .addPositionalParam(
            "testDir",
            "Directory with *.ts files. Sholud end with '/'"
        )
        .setAction(
            async (
                { testDir, noCompile, deployFixture },
                { run, network, ethers }
            ) => {

                const testFiles: string[] = []
                fs.readdir(testDir, (err: string, files: string[]) => {
                    files.forEach(file => {
                        if (file.endsWith(".ts")) {
                            file = testDir + file;
                            testFiles.push(file);
                        }
                    });
                });

                await run("test", { testFiles, noCompile, deployFixture });
            });


    task(
        "npm-package",
        "Packages type definitions and abis into npm package"
    ).setAction(async () => {
        const rimraf = require("rimraf");
        const fs = require("fs");
        const fsExtra = require("fs-extra");
        try {
            rimraf.sync("./package");
        } catch { }
        fs.mkdirSync("./package");
        fsExtra.copySync("./typechain", "./package/typings");
        const klaw = require("klaw-sync");
        const contracts = klaw("./artifacts/contracts")
            .filter((x: { path: string }) => x.path.endsWith(".json") && !x.path.endsWith(".dbg.json"))
            .map((x: { path: string }) => {
                const { abi, contractName: name } = fsExtra.readJsonSync(x.path);
                return { abi, name };
            });
        fs.mkdirSync('./package/abis')
        for (const contract of contracts) {
            fs.writeFileSync(`./package/abis/${contract.name}.json`, JSON.stringify(contract.abi), {
                encoding: "utf8",
            });
        }
        fsExtra.writeJsonSync('./package/package.json', {
            name: "@blindex/stablecoins",
            version: "0.0.1",
            types: "typings/index.d.ts"
        }
        )
    });

    task("setup:account")
        .setAction(async (args, hre) => {

            // send ether
            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: ["0xbe0eb53f46cd790cd13851d5eff43d12404d33e8"]
            });

            const signer = await hre.ethers.getSigner("0xbe0eb53f46cd790cd13851d5eff43d12404d33e8");

            const resp = await signer.sendTransaction({ to: '0x774289Cb40c98B4f5b64a152BF7e5F94Fee38669', value: hre.ethers.utils.parseEther("7.5") });
            console.log(resp);

            // send dai
            const dai = '0x6b175474e89094c44da98b954eedeac495271d0f'
            const bigDaiHolder = '0x66c57bf505a85a74609d2c83e94aabb26d691e1f'
            await hre.ethers.provider.send(
                "hardhat_impersonateAccount",
                [bigDaiHolder]
            )
            const signerLink = hre.ethers.provider.getSigner(bigDaiHolder)
            const DaiContractFactory = await hre.ethers.getContractFactory("ERC20", signerLink);
            const DaiContract = DaiContractFactory.attach(dai);
            const transferTransaction = await DaiContract.transfer('0x774289Cb40c98B4f5b64a152BF7e5F94Fee38669', BigNumber.from('10000000000000000000'))
            await hre.ethers.provider.send(
                "hardhat_stopImpersonatingAccount",
                [bigDaiHolder]
            )
        });

    task("setup:feed-test-user-ag")
        .setAction(async (args, hre) => {
            const deployer = await getDeployer(hre);

            const weth = await getWeth(hre);
            const wbtc = await getWbtc(hre);
            const bdx = await getBdx(hre);
            const bdeu = await getBdEu(hre);

            await weth.deposit({ value: to_d18(200) });
            await mintWbtc(hre, deployer, to_d18(100))

            const testUserAddress = "0xED3622f02b1619d397502a9FFF1dfe3d0fB2988c";

            await (await weth.transfer(testUserAddress, to_d18(1))).wait();
            await (await wbtc.transfer(testUserAddress, to_d8(1))).wait();
        }
        );

    task("setup:test-user-balance-ag")
        .setAction(async (args, hre) => {
            const deployer = await getDeployer(hre);

            const weth = await getWeth(hre);
            const wbtc = await getWbtc(hre);
            const bdx = await getBdx(hre);
            const bdeu = await getBdEu(hre);

            const testUserAddress = "0xED3622f02b1619d397502a9FFF1dfe3d0fB2988c";


            console.log("weth: " + await weth.balanceOf(testUserAddress));
            console.log("wbtc: " + await wbtc.balanceOf(testUserAddress));
            console.log("bdx: " + await bdx.balanceOf(testUserAddress));
            console.log("bdeu: " + await bdeu.balanceOf(testUserAddress));
        });

    task("simulateTimeElapse")
        .setAction(async () => {
            await simulateTimeElapseInSeconds(3600 * 24 * 365 * 6);
        });

    task("setBdEuCollateralRatioTo1")
        .setAction(async (args, hre) => {
            await lockBdEuCrAt(hre, 1)
        });

    task("setBdEuCollateralRatioTo05")
        .setAction(async (args, hre) => {
            await lockBdEuCrAt(hre, 0.5)
        });

    task("setBdEuCollateralRatioTo0")
        .setAction(async (args, hre) => {
            await lockBdEuCrAt(hre, 0)
        });
}