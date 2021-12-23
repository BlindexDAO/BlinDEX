import { expect } from "chai";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BigNumber } from 'ethers';
import { getBdx, getTreasury } from "../../utils/DeployedContractsHelpers";

export async function expectToFail(fun: () => any, message: string){
    await expect((async () => {
        await fun();
    })()).to.be.rejectedWith(message);
}

export async function provideBdx(hre: HardhatRuntimeEnvironment, to: string, amount: BigNumber){
    const treasury = await getTreasury(hre);
    const bdx = await getBdx(hre);
    await bdx.connect(treasury).transfer(to, amount);
}