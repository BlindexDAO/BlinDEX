import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { BDXShares } from '../typechain/BDXShares';
import { to_d18 } from '../utils/Helpers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const [ deployer ] = await hre.ethers.getSigners();
    const treasury = await hre.ethers.getNamedSigner("COLLATERAL_FRAX_AND_FXS_OWNER");

    const bdxInstance = await hre.ethers.getContract("BDXShares") as BDXShares;

    // mint half of the BDX up front, to reseve for staking rewards
    await bdxInstance.connect(deployer).mint(
        '0x0000000000000000000000000000000000000000',
        treasury.address,
        to_d18(21).mul(1e6).div(2)
    );

    // One time migration
    return true;
};
func.id = __filename
func.tags = ['BdxMint'];
func.dependencies = ['BDX'];
export default func;
