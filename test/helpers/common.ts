import { expect } from "chai";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { BigNumber, ContractReceipt } from "ethers";
import { extractTheOnlyEvent } from "../../utils/ExtractingEvents";
import { getBdEu, getBdx, getTreasurySigner } from "../../utils/DeployedContractsHelpers";

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function expectToFail(fun: () => any, message: string) {
  await expect(
    (async () => {
      await fun();
    })()
  ).to.be.rejectedWith(message);
}

export function expectEvent(receipt: ContractReceipt, expectedEventName: string) {
  const events = receipt.events?.filter(x => x.event === expectedEventName);
  expect(events).to.not.be.empty;
}

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export function expectEventWithArgs(receipt: ContractReceipt, expectedEventName: string, eventArgs: any[]) {
  const theOnlyEvent = extractTheOnlyEvent(receipt, expectedEventName);

  expect(theOnlyEvent.args).to.eql(eventArgs);
}

export async function provideBdx(hre: HardhatRuntimeEnvironment, to: string, amount: BigNumber) {
  const treasury = await getTreasurySigner(hre);
  const bdx = await getBdx(hre);
  await bdx.connect(treasury).transfer(to, amount);
}

export async function provideBdEu(hre: HardhatRuntimeEnvironment, to: string, amount: BigNumber) {
  const treasury = await getTreasurySigner(hre);
  const bdEu = await getBdEu(hre);
  await bdEu.connect(treasury).transfer(to, amount);
}

export const subtractionOverflowExceptionMessage =
  "Error: VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)";
