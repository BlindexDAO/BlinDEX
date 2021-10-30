import cap from 'chai-as-promised';
import chai from "chai";
import { solidity } from 'ethereum-waffle';
import hre from 'hardhat';
import { setUpFunctionalSystem } from "../../utils/SystemSetup";
import { getDeployer } from "../helpers/common";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { Vesting } from '../../typechain/Vesting';
import { BDXShares } from '../../typechain/BDXShares';
import { to_d18, d18_ToNumber } from '../../utils/Helpers';
import { BigNumber } from '@ethersproject/bignumber';

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
    bdx = await hre.ethers.getContract('BDXShares', ownerUser) as BDXShares;
    vesting = await hre.ethers.getContract("Vesting", ownerUser) as Vesting;
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
        await setUpFunctionalSystem(hre, 1, true);
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

        await moveTimeForwardBy(vestingTimeSeconds)

        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await vesting.connect(testUser1).claim();
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

        await vesting.connect(ownerUser).claim();
        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await vesting.connect(ownerUser).claim();
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
        await vesting.connect(testUser1).claim();
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
        await vesting.connect(testUser1).claim();
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
        await vesting.connect(testUser1).claim();
        await moveTimeForwardBy(vestingTimeSeconds);
        await vesting.connect(testUser1).claim();
        const balanceAfterClaim = await bdx.balanceOf(testUser1.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(amount_d18);
    });

    it('claim should transfer full when claimed twice during vesting and after vesting ended', async () => {
        const amount = 1;
        const amount_d18 = to_d18(amount);
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
        await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);

        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await moveTimeForwardBy(vestingTimeSeconds.div(5));
        await vesting.connect(testUser1).claim();
        await moveTimeForwardBy(vestingTimeSeconds.div(5));
        await vesting.connect(testUser1).claim();
        await moveTimeForwardBy(vestingTimeSeconds);
        await vesting.connect(testUser1).claim();
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
        await vesting.connect(testUser2).claim();
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

        await vesting.connect(testUser1).claim();
        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await vesting.connect(testUser1).claim();
        const balanceAfterClaim = await bdx.balanceOf(testUser1.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.lt(to_d18(amount / 100));
    })

    it('should not create more schedules for user than the limit, max amount of schedules is possible to claim', async () => {
        const amount = 0.001;
        const amount_d18 = to_d18(amount);
        const schedulesLimit = Number(await vesting.MAX_VESTING_SCHEDULES_PER_USER());
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();


        for (var i = 0; i < schedulesLimit; i++) {
            await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);
            await vesting.connect(testScheduler).schedule(testUser1.address, amount_d18);
        }

        await bdx.connect(testRewardProvider).approve(vesting.address, amount_d18);

        await expect(
            vesting.connect(testScheduler).schedule(testUser1.address, amount_d18)
        ).to.be.revertedWith('Limit for vesting schedules for user exceeded');

        await moveTimeForwardBy(vestingTimeSeconds)

        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await vesting.connect(testUser1).claim();
        const balanceAfterClaim = await bdx.balanceOf(testUser1.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(amount_d18.mul(schedulesLimit));
    })
});