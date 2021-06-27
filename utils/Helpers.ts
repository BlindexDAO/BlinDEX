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

export function to_d18(n: number): BigNumber {
    return numberToBigNumberFixed(n, 18)
}

export function to_d8(n: number): BigNumber {
    return numberToBigNumberFixed(n, 8)
}

export function numberToBigNumberFixed(n: number, decimals: number): BigNumber {
    return BigNumber.from(10).pow(decimals).mul(n);
}
  
export function d18_ToNumber(n: BigNumber): number {
    return bigNumberToDecimal(n, 18)
}

export function bigNumberToDecimal(n: BigNumber, decimals: number){
    return Number(n.toString()) / 10**decimals;
}

export function diffPct(a: BigNumber, b: BigNumber){
    if(a.toString() === "0" && b.toString() === "0"){
        return 0;
    }
    else if(a.toString() === "0"){
        return Infinity;
    }
    else{
        return a.sub(b).mul(1e6).div(a).toNumber() / 1e6 * 100;
    }
}
