import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { to_d18 } from "../../utils/NumbersHelpers"
import { simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat"
import { Timelock } from "../../typechain/TimeLock";
import { StakingRewardsDistribution } from "../../typechain/StakingRewardsDistribution";
import TimeTraveler from "../../utils/TimeTraveler";
import func from "../../deploy/2_2_euro_stablecoin";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

const timeTraveler = new TimeTraveler(hre.network.provider);

const day = 60*60*24;

async function GetSRD() : Promise<StakingRewardsDistribution> {
    const deployer = (await hre.getNamedAccounts()).DEPLOYER;
    const stakingRewardsDistribution = await hre.ethers.getContract("StakingRewardsDistribution", deployer) as StakingRewardsDistribution;
    return stakingRewardsDistribution;
}

async function GetTimelock() : Promise<Timelock> {
    const deployer = (await hre.getNamedAccounts()).DEPLOYER;
    const timelock = await hre.ethers.getContract("Timelock", deployer) as Timelock;
    return timelock;
}

async function ExecuteTranasactionWithTimelock(executionEta: number, elapseTime: number){
    const timelock = await GetTimelock();

    const now = (await hre.ethers.provider.getBlock('latest')).timestamp;

    const stakingRewardsDistribution = await GetSRD();

    await timelock.queueTransaction(
        stakingRewardsDistribution.address,
        0,
        "",
        stakingRewardsDistribution.interface.encodeFunctionData("resetRewardsWeights"),
        now + executionEta);

    simulateTimeElapseInSeconds(elapseTime);

    await timelock.executeTransaction(
        stakingRewardsDistribution.address,
        0,
        "",
        stakingRewardsDistribution.interface.encodeFunctionData("resetRewardsWeights"),
        now + executionEta)
}

describe("Execute with timelock", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
        
        const timelock = await GetTimelock();
        const stakingRewardsDistribution = await GetSRD();
        stakingRewardsDistribution.transferOwnership(timelock.address)
    });

    it("transaction should be executed before eta, withing grace period", async () => {
        const stakingRewardsDistribution = await GetSRD();

        const totalBefore = await stakingRewardsDistribution.stakingRewardsWeightsTotal();
        
        await ExecuteTranasactionWithTimelock(day*(15+1), day*(15+1+1));

        const totalAfter = await stakingRewardsDistribution.stakingRewardsWeightsTotal();

        expect(totalBefore).be.gt(0);
        expect(totalAfter).be.eq(0);
    });

    it("transaction fail if executed before eta", async () => {
        await expect((async () => {
            await (await ExecuteTranasactionWithTimelock(day*(15+1), day*7))
        })()).to.be.rejectedWith("Transaction hasn't surpassed time lock.");
    });

    it("transaction fail if executed after grace period", async () => {
        await expect((async () => {
            await (await ExecuteTranasactionWithTimelock(day*(15+1), day*60))
        })()).to.be.rejectedWith("Transaction is stale.");
    });

    it("transaction fail if cheduled before mininum eta", async () => {
        await expect((async () => {
            await (await ExecuteTranasactionWithTimelock(day*2, day*10))
        })()).to.be.rejectedWith("Estimated execution block must satisfy delay.");
    });
})