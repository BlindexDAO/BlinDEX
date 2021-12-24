import { expect } from "chai";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BigNumber } from "ethers";
import { getBdEu, getBdx, getTreasury } from "../../utils/DeployedContractsHelpers";

export async function expectToFail(fun: () => any, message: string) {
  await expect(
    (async () => {
      await fun();
    })()
  ).to.be.rejectedWith(message);
}

export async function provideBdx(hre: HardhatRuntimeEnvironment, to: string, amount: BigNumber) {
  const treasury = await getTreasury(hre);
  const bdx = await getBdx(hre);
  await bdx.connect(treasury).transfer(to, amount);
}

export async function provideBdEu(hre: HardhatRuntimeEnvironment, to: string, amount: BigNumber) {
  const treasury = await getTreasury(hre);
  const bdEu = await getBdEu(hre);
  await bdEu.connect(treasury).transfer(to, amount);
}
