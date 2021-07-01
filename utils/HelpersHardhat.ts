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
