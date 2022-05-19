import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { ERC20 } from "../typechain/ERC20";
import * as constants from "../utils/Constants";
import { numberToBigNumberFixed, to_d18 } from "./NumbersHelpers";

export async function getUsdcFor(hre: HardhatRuntimeEnvironment, receiverAddress: string, amount: number) {
  // Any big holder will do, the list of whales can be found here: https://etherscan.io/token/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48#balances
  const usdcHolder = "0x0a59649758aa4d66e25f08dd01271e891fe52199";

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [usdcHolder]
  });

  const usdcHolderSigner = await hre.ethers.getSigner(usdcHolder);

  const usdc = (await hre.ethers.getContractAt("ERC20", constants.EXTERNAL_USD_STABLE[hre.network.name].address, usdcHolderSigner)) as ERC20;

  await hre.network.provider.send("hardhat_setBalance", [usdcHolder, "0x" + to_d18(1).toString()]);

  await usdc.transfer(receiverAddress, numberToBigNumberFixed(amount, 6));

  await hre.network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [usdcHolder]
  });
}

export async function getDaiFor(hre: HardhatRuntimeEnvironment, receiverAddress: string, amount: number) {
  // Any big holder will do, the list of whales can be found here: https://etherscan.io/token/0x6B175474E89094C44Da98b954EedeAC495271d0F#balances
  const daiHolder = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [daiHolder]
  });
  const daiHolderSigner = await hre.ethers.getSigner(daiHolder);

  const dai = (await hre.ethers.getContractAt("ERC20", constants.SECONDARY_EXTERNAL_USD_STABLE[hre.network.name].address, daiHolderSigner)) as ERC20;

  await hre.network.provider.send("hardhat_setBalance", [daiHolder, "0x" + to_d18(1).toString()]);

  await dai.transfer(receiverAddress, numberToBigNumberFixed(amount, 18));
}
