import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';
import { to_d18 } from '../utils/Helpers';
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    console.log("starting deployment: mint bdx");

    const deployer = await hre.ethers.getSigner((await hre.getNamedAccounts()).DEPLOYER);
    const treasury = await hre.ethers.getNamedSigner("TREASURY");
    const bdxInstance = await hre.ethers.getContract("BDXShares") as BDXShares;

    // mint all of the BDX up front to the treasury
    await (await bdxInstance.connect(deployer).mint(
        ethers.constants.AddressZero,
        treasury.address,
        to_d18(21).mul(1e6)
    )).wait();

    console.log("finished deployment: mint bdx");

    // One time migration
    return true;
};
func.id = __filename
func.tags = ['BdxMint'];
func.dependencies = ['BDX'];
export default func;
