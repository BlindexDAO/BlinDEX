import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import cap from "chai-as-promised";
import { simulateTimeElapseInDays, simulateTimeElapseInSeconds, toErc20 } from "../../utils/Helpers"
import { Timelock } from "../../typechain/TimeLock";
import { StakingRewardsDistribution } from "../../typechain/StakingRewardsDistribution";
import TimeTraveler from "../../utils/TimeTraveler";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

const timeTraveler = new TimeTraveler(hre.network.provider);

describe("Execute with timelock", () => {

    beforeEach(async () => {
        await hre.deployments.fixture();
    });

    it.only("transaction should be executed", async () => {
        const [ deployer ] = await hre.ethers.getSigners();

        const timelock = await hre.ethers.getContract("Timelock", deployer.address) as unknown as Timelock;

        const stakingRewardsDistribution = await hre.ethers.getContract("StakingRewardsDistribution", deployer.address) as unknown as StakingRewardsDistribution;

        const totalBefore = await stakingRewardsDistribution.stakingRewardsWeightsTotal();
        
        const now = (await hre.ethers.provider.getBlock('latest')).timestamp;

        await timelock.queueTransaction(
            stakingRewardsDistribution.address,
            0,
            "",
            // stakingRewardsDistribution.interface.encodeFunctionData("resetRewardsWeights", []),
            stakingRewardsDistribution.interface.encodeFunctionData("resetRewardsWeights"),
            now + 60*60*24*(15+1));

        simulateTimeElapseInDays(15+1+1);

        await timelock.executeTransaction(
            stakingRewardsDistribution.address,
            0,
            "",
            // stakingRewardsDistribution.interface.encodeFunctionData("resetRewardsWeights", []),
            stakingRewardsDistribution.interface.encodeFunctionData("resetRewardsWeights"),
            now + 60*60*24*(15+1))

        const totalAfter = await stakingRewardsDistribution.stakingRewardsWeightsTotal();

        expect(totalBefore).be.gt(0);
        expect(totalAfter).be.eq(0);
    });
})