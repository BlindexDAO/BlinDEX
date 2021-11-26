import cap from 'chai-as-promised';
import chai from "chai";
import { solidity } from 'ethereum-waffle';
import hre from 'hardhat';
import { setUpFunctionalSystemForTests } from "../../utils/SystemSetup";
import { getBdx, getDeployer, getVesting } from "../../utils/DeployedContractsHelpers";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { Vesting } from '../../typechain/Vesting';
import { BDXShares } from '../../typechain/BDXShares';
import { to_d18, d18_ToNumber } from '../../utils/NumbersHelpers';
import { BigNumber } from '@ethersproject/bignumber';
import { simulateTimeElapseInDays, simulateTimeElapseInSeconds } from "../../utils/HelpersHardhat"

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

let ownerUser: SignerWithAddress;
let testUser1: SignerWithAddress;
let testUser2: SignerWithAddress;
let testScheduler: SignerWithAddress;
let testRewardProvider: SignerWithAddress;
let testNotScheduler: SignerWithAddress;

let bdx: BDXShares;

let vesting: Vesting

async function initialize() {
    ownerUser = await getDeployer(hre);
    testUser1 = await hre.ethers.getNamedSigner('TEST1');
    testScheduler = await hre.ethers.getNamedSigner('TEST_VESTING_SCHEDULER');
    testRewardProvider = await hre.ethers.getNamedSigner('TEST_VESTING_REWARDS_PROVIDER');
    testNotScheduler = await hre.ethers.getNamedSigner('TEST2');
    testUser2 = await hre.ethers.getNamedSigner('TEST2');
    bdx = await getBdx(hre);
    vesting = await getVesting(hre);
}

export async function moveTimeForwardBy(seconds: BigNumber) {
    await hre.network.provider.send("evm_increaseTime", [Number(seconds)])
}

describe('Vesting', () => {
    before(async () => {
        await initialize();
    })
    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystemForTests(hre, 1);
        await vesting.connect(ownerUser).setVestingScheduler(testScheduler.address);
        await vesting.connect(ownerUser).setFundsProvider(testRewardProvider.address);
        await bdx.connect(ownerUser).transfer(testRewardProvider.address, to_d18(20));
    });

    it('should create schedule for user', async () => {
        const amount = 1;
        const amount_d18 = to_d18(amount);

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);

        const schedule = await vesting.vestingSchedules(testUser1.address, 0);

        expect(schedule.totalVestedAmount_d18, 'Vesting amount incorrect').to.be.eq(amount_d18);
        expect(schedule.releasedAmount_d18, 'Released amount not 0').to.be.eq(0);

    });

    it('should not allow other user to create schedule', async () => {
        const amount = 1;
        const amount_d18 = to_d18(amount);

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);

        await expect(
            vesting.connect(testNotScheduler).schedule(testUser1.address, amount_d18)
        ).to.be.revertedWith('Only vesting scheduler can create vesting schedules');
    });

    it('claim should transfer full amount after vesting has ended', async () => {
        const amount = 1;
        const amount_d18 = to_d18(amount);
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);

        await moveTimeForwardBy(vestingTimeSeconds);

        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await vesting.connect(testUser1).claim(0, 100);
        const balanceAfterClaim = await bdx.balanceOf(testUser1.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(amount_d18);
    });

    it('claim should not transfer the same schedule twice', async () => {
        const amount = 1;
        const amount_d18 = to_d18(amount);
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);

        await moveTimeForwardBy(vestingTimeSeconds)

        await vesting.connect(ownerUser).claim(0, 100);
        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await vesting.connect(ownerUser).claim(0, 100);
        const balanceAfterClaim = await bdx.balanceOf(testUser1.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(0);
    });

    it('claim should transfer multiple vested schedules at once', async () => {
        const amount = 1;
        const amount_d18 = to_d18(amount);
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);

        await moveTimeForwardBy(vestingTimeSeconds)

        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await vesting.connect(testUser1).claim(0, 100);
        const balanceAfterClaim = await bdx.balanceOf(testUser1.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(amount_d18.mul(2));
    });

    it('claim should transfer partial amount after vesting is partly done', async () => {
        const amount = 1;
        const amount_d18 = to_d18(amount);
        const timePartition = 7
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);

        await moveTimeForwardBy(vestingTimeSeconds.div(timePartition))

        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await vesting.connect(testUser1).claim(0, 100);
        const balanceAfterClaim = await bdx.balanceOf(testUser1.address);

        const transferredAmount = balanceAfterClaim.sub(balanceBeforeClaim);
        const expectedAmount = amount_d18.div(timePartition);

        //Possible timestamp slippage - up tp 10s. Calculating possible surplus transfer
        const surplusAmount = amount * 10 / Number(vestingTimeSeconds);

        expect(d18_ToNumber(transferredAmount)).to.be.closeTo(d18_ToNumber(expectedAmount), surplusAmount);
    });

    it('claim should transfer full when claimed halfway through and after vesting ended', async () => {
        const amount = 1;
        const amount_d18 = to_d18(amount);
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);

        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await moveTimeForwardBy(vestingTimeSeconds.div(2));
        await vesting.connect(testUser1).claim(0, 100);
        await moveTimeForwardBy(vestingTimeSeconds);
        await vesting.connect(testUser1).claim(0, 100);
        const balanceAfterClaim = await bdx.balanceOf(testUser1.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(amount_d18);
    });

    it('should free up the vesting schedule slot when vesting finished and rewards claimed', async () => {
        const amount1_d18 = to_d18(1);
        const amount2_d18 = to_d18(2);
        const amount3_d18 = to_d18(3);
        const amount4_d18 = to_d18(4);
        const amount5_d18 = to_d18(5);
        const vestingTimeSeconds = (await vesting.vestingTimeInSeconds()).toNumber();
        const secondsInDay = 60*60*24;

        const balanceBefore = await bdx.balanceOf(testUser1.address);

        await bdx.connect(testRewardProvider).approve(vesting.address, to_d18(100)); // excessive

        await vesting.connect(testScheduler).schedule(testUser1.address, amount1_d18); // [1]
        await simulateTimeElapseInDays(2);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount2_d18); // [1,2]
        await simulateTimeElapseInDays(2);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount3_d18); // [1,2,3]
        await simulateTimeElapseInDays(2);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount4_d18); // [1,2,3,4]
        
        const schedulesCount1 = await vesting.userVestingSchedulesCount(testUser1.address);
        expect(schedulesCount1).to.be.eq(4, "invalid schedules count after schedule 4");

        await simulateTimeElapseInSeconds(vestingTimeSeconds-3*secondsInDay); // make only 1st and 2nd vestings schedule fully claimable
        await vesting.connect(testUser1).claim(0, 100); // [4,3] // now the first vesting schedule should be removed

        const schedulesCount2 = await vesting.userVestingSchedulesCount(testUser1.address);
        expect(schedulesCount2).to.be.eq(2, "invalid schedules count after claim 1");

        await vesting.connect(testScheduler).schedule(testUser1.address, amount5_d18); // [4,3,5]

        const schedulesCount3 = await vesting.userVestingSchedulesCount(testUser1.address);
        expect(schedulesCount3).to.be.eq(3, "invalid schedules count after schedule 4");

        const vestingSchedule0 = await vesting.vestingSchedules(testUser1.address, 0);
        const vestingSchedule1 = await vesting.vestingSchedules(testUser1.address, 1);
        const vestingSchedule2 = await vesting.vestingSchedules(testUser1.address, 2);

        expect(d18_ToNumber(vestingSchedule0.totalVestedAmount_d18)).to.be.eq(4, "invalid vesting schedule[0]");
        expect(d18_ToNumber(vestingSchedule1.totalVestedAmount_d18)).to.be.eq(3, "invalid vesting schedule[1]");
        expect(d18_ToNumber(vestingSchedule2.totalVestedAmount_d18)).to.be.eq(5, "invalid vesting schedule[2]");

        await simulateTimeElapseInSeconds(vestingTimeSeconds); // make all vesting schedules fully claimable
        await vesting.connect(testUser1).claim(0, 100); // [] // now all vesting schedule should be removed 

        const schedulesCount4 = await vesting.userVestingSchedulesCount(testUser1.address);
        expect(schedulesCount4).to.be.eq(0, "not all vesting schedules have been removed");

        const balanceAfter = await bdx.balanceOf(testUser1.address);
        const balanceDiff = d18_ToNumber(balanceAfter.sub(balanceBefore));

        expect(balanceDiff).to.be.eq(1+2+3+4+5, "invalid balance diff");
    });

    it('claim should transfer full when claimed twice during vesting and after vesting ended', async () => {
        const amount = 1;
        const amount_d18 = to_d18(amount);
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);

        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await moveTimeForwardBy(vestingTimeSeconds.div(5));
        await vesting.connect(testUser1).claim(0, 100);
        await moveTimeForwardBy(vestingTimeSeconds.div(5));
        await vesting.connect(testUser1).claim(0, 100);
        await moveTimeForwardBy(vestingTimeSeconds);
        await vesting.connect(testUser1).claim(0, 100);
        const balanceAfterClaim = await bdx.balanceOf(testUser1.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(amount_d18);
    });

    it('claim should not transfer rewards to different user', async () => {
        const amount = 1;
        const amount_d18 = to_d18(amount);
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);

        await moveTimeForwardBy(vestingTimeSeconds)

        const balanceBeforeClaim = await bdx.balanceOf(testUser2.address);
        await vesting.connect(testUser2).claim(0, 100);
        const balanceAfterClaim = await bdx.balanceOf(testUser2.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(0);
    });

    it('claim should not allow for transferring all funds during vesting', async () => {
        const amount = 1;
        const amount_d18 = to_d18(amount);
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);

        await moveTimeForwardBy(vestingTimeSeconds.div(2))

        await vesting.connect(testUser1).claim(0, 100);
        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await vesting.connect(testUser1).claim(0, 100);
        const balanceAfterClaim = await bdx.balanceOf(testUser1.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.lt(to_d18(amount / 100));
    });
});