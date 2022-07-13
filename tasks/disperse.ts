import { task } from "hardhat/config";
import { Disperse } from "../typechain";
import { getBdx, getUser1 } from "../utils/DeployedContractsHelpers";
import { printAndWaitOnTransaction } from "../utils/DeploymentHelpers";
import { to_d18 } from "../utils/NumbersHelpers";

export function load() {
  task("disperse:ether").setAction(async (args, hre) => {
    // Enter wallet addresses and amounts
    const wallets = [] as string[];
    const amounts = [] as number[];

    console.log("Start: disperse ether");
    const amounts_d18 = amounts.map(amount => to_d18(+amount));
    const user = await getUser1(hre);
    const disperse = (await hre.ethers.getContract("Disperse", user)) as Disperse;

    console.log(`User ether balance is: ${(await user.getBalance()).toString()}`);
    for (let index = 0; index < wallets.length; index++) {
      const walletAddress = wallets[index];
      console.log(`Wallet ${walletAddress} balance is: ${(await hre.ethers.provider.getBalance(walletAddress)).toString()}`);
    }

    console.log("disperseEther");
    const value = amounts_d18.reduce((totalValue, amount) => totalValue.add(amount), hre.ethers.constants.Zero);
    await printAndWaitOnTransaction(await disperse.disperseEther(wallets, amounts_d18, { value }));

    console.log(`User ether balance is: ${(await user.getBalance()).toString()}`);
    for (let index = 0; index < wallets.length; index++) {
      const walletAddress = wallets[index];
      console.log(`Wallet ${walletAddress} balance is: ${(await hre.ethers.provider.getBalance(walletAddress)).toString()}`);
    }
  });

  task("disperse:bdx").setAction(async (args, hre) => {
    // Enter wallet addresses and amounts
    const wallets = [] as string[];
    const amounts = [] as number[];

    console.log("Start: disperse erc20");
    const amounts_d18 = amounts.map(amount => to_d18(+amount));
    const user = await getUser1(hre);
    const disperse = (await hre.ethers.getContract("Disperse", user)) as Disperse;
    const bdx = await getBdx(hre);

    console.log(`User BDX balance is: ${(await bdx.balanceOf(user.address)).toString()}`);
    for (let index = 0; index < wallets.length; index++) {
      const walletAddress = wallets[index];
      console.log(`Wallet ${walletAddress} balance is: ${(await bdx.balanceOf(walletAddress)).toString()}`);
    }

    console.log("Allowance");
    const totalAllowance = amounts_d18.reduce((totalAllowance, amount) => totalAllowance.add(amount), hre.ethers.constants.Zero);
    await printAndWaitOnTransaction(await bdx.connect(user).approve(disperse.address, totalAllowance));

    console.log("disperseBDX");
    await printAndWaitOnTransaction(await disperse.disperseToken(bdx.address, wallets, amounts_d18));

    console.log(`User BDX balance is: ${(await bdx.balanceOf(user.address)).toString()}`);
    for (let index = 0; index < wallets.length; index++) {
      const walletAddress = wallets[index];
      console.log(`Wallet ${walletAddress} balance is: ${(await bdx.balanceOf(walletAddress)).toString()}`);
    }
  });
}
