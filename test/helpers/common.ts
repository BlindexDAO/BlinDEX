import { expect } from "chai";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { BigNumber } from "ethers";
import { getBdEu, getBdx, getTreasury } from "../../utils/DeployedContractsHelpers";

//eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export const subtractionOverflowExceptionMessage =
  "Error: VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)";
