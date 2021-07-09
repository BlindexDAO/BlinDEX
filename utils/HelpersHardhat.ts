import { BigNumber } from 'ethers';
import TimeTraveler from "./TimeTraveler"

export async function simulateTimeElapseInDays(days: number){
    const hre = await import("hardhat")
    const timeTraveler = new TimeTraveler(hre.network.provider);
    const minutesInDay = 60*24;
    const secondsInDay = minutesInDay*60;
    await timeTraveler.increaseTime(days*secondsInDay);
}

export async function simulateTimeElapseInSeconds(seconds: number){
    const hre = await import("hardhat")
    const timeTraveler = new TimeTraveler(hre.network.provider);
    await timeTraveler.increaseTime(seconds);
}
