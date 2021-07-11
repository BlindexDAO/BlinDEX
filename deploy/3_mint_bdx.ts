import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';
import { BigNumber } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const [ deployer ] = await hre.ethers.getSigners();

    const bdxInstance = await hre.ethers.getContract("BDXShares") as unknown as BDXShares;

    // todo ag why?!?!? we mint new BDX in multiple places!
    // mint all BDX up front
    await (await bdxInstance.connect(deployer).mint(
        '0x0000000000000000000000000000000000000000',
        (await hre.ethers.getNamedSigner("COLLATERAL_FRAX_AND_FXS_OWNER")).address,
        BigNumber.from(21).mul(BigNumber.from(10).pow(6 + 18)))).wait();

    // One time migration
    return true;
};
func.id = __filename
func.tags = ['BdxMint'];
func.dependencies = ['BDX'];
export default func;
