import hre from "hardhat";
import { BigNumber } from 'ethers';
import TimeTraveler from "./TimeTraveler"

const timeTraveler = new TimeTraveler(hre.network.provider);

export async function simulateTimeElapseInDays(days: number){
    const minutesInDay = 60*24;
    const secondsInDay = minutesInDay*60;
    await timeTraveler.increaseTime(days*secondsInDay);
}

export async function simulateTimeElapseInSeconds(seconds: number){
    await timeTraveler.increaseTime(seconds);
}

export function toErc20(n: number): BigNumber {
    return numberToBigNumberFixed(n, 18)
}

export function numberToBigNumberFixed(n: number, decimals: number): BigNumber {
    return BigNumber.from(10).pow(decimals).mul(n)
}
  
export function erc20ToNumber(n: BigNumber): Number {
    return bigNumberToDecmal(n, 18)
}

export function bigNumberToDecmal(n: BigNumber, decimals: number){
    return Number(n.toString()) / 10**decimals;
}

export function diffPct(a: BigNumber, b: BigNumber){
    return a.sub(b).mul(1e6).div(a).toNumber() / 1e6 * 100;
}
