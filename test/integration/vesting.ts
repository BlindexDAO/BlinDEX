import cap from 'chai-as-promised';
import chai from "chai";
import { solidity } from 'ethereum-waffle';
import hre from 'hardhat';
import { setUpFunctionalSystem } from "../helpers/SystemSetup";
import { getDeployer } from "../helpers/common";
import { SignerWithAddress } from "hardhat-deploy-ethers/dist/src/signers";
import { Vesting } from '../../typechain/Vesting';
import { BDXShares } from '../../typechain/BDXShares';
import { StakingRewardsDistribution } from '../../typechain/StakingRewardsDistribution';
import { to_d18 } from '../../utils/Helpers';
import { BigNumber } from '@ethersproject/bignumber';

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

let ownerUser: SignerWithAddress;
let testUser1: SignerWithAddress;
let testUser2: SignerWithAddress;

let stakingRewardsDistribution: StakingRewardsDistribution;

let bdx: BDXShares;

let vesting: Vesting

async function initialize() {
    ownerUser = await getDeployer(hre);
    testUser1 = await hre.ethers.getNamedSigner('TEST1');
    testUser2 = await hre.ethers.getNamedSigner('TEST2');
    bdx = await hre.ethers.getContract('BDXShares', ownerUser) as BDXShares;
    stakingRewardsDistribution = await hre.ethers.getContract("StakingRewardsDistribution", ownerUser) as StakingRewardsDistribution;
    vesting = await hre.ethers.getContract("Vesting", ownerUser) as Vesting;
}

export async function moveTimeForwardBy(seconds: BigNumber) {
    await hre.network.provider.send("evm_increaseTime", [Number(seconds)])
}

describe.only('Vesting', () => {
    before(async () => {
        await initialize();
    })
    beforeEach(async () => {
        await hre.deployments.fixture();
        await setUpFunctionalSystem(hre);
        await vesting.connect(ownerUser).setVestingScheduler(ownerUser.address);
        await vesting.connect(ownerUser).setFundsProvider(ownerUser.address);
    });

    it('should create schedule for owner', async () => {
        const amount = 1;

        await bdx.connect(ownerUser).approve(vesting.address, to_d18(amount));
        await vesting.connect(ownerUser).schedule(ownerUser.address, to_d18(amount));

        const schedule = await vesting.vestingSchedules(ownerUser.address, 0);

        expect(schedule.totalVestedAmount_d18, 'Vesting amount incorrect').to.be.eq(to_d18(amount));
        expect(schedule.releasedAmount_d18, 'Released amount not 0').to.be.eq(0);

    });

    it('should not allow other user to create schedule', async () => {
        const amount = 1;

        await bdx.connect(testUser1).approve(vesting.address, to_d18(amount));

        await expect(
            vesting.connect(testUser1).schedule(ownerUser.address, to_d18(amount))
        ).to.be.revertedWith('Only vesting scheduler can create vesting schedules');
    });

    it('claim should transfer full amount after vesting has ended', async () => {
        const amount = 1;
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(ownerUser).approve(vesting.address, to_d18(amount));
        await vesting.connect(ownerUser).schedule(ownerUser.address, to_d18(amount));

        await moveTimeForwardBy(vestingTimeSeconds)

        const balanceBeforeClaim = await bdx.balanceOf(ownerUser.address);
        await vesting.connect(ownerUser).claim();
        const balanceAfterClaim = await bdx.balanceOf(ownerUser.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(to_d18(amount));
    });

    it('claim should not transfer the same schedule twice', async () => {
        const amount = 1;
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(ownerUser).approve(vesting.address, to_d18(amount));
        await vesting.connect(ownerUser).schedule(ownerUser.address, to_d18(amount));

        const schedule = await vesting.vestingSchedules(ownerUser.address, 0);

        await moveTimeForwardBy(vestingTimeSeconds)

        await vesting.connect(ownerUser).claim();
        const balanceBeforeClaim = await bdx.balanceOf(ownerUser.address);
        await vesting.connect(ownerUser).claim();
        const balanceAfterClaim = await bdx.balanceOf(ownerUser.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(to_d18(0));
    });

    it('claim should transfer multiple vested schedules at once', async () => {
        const amount = 1;
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(ownerUser).approve(vesting.address, to_d18(amount));
        await vesting.connect(ownerUser).schedule(ownerUser.address, to_d18(amount));

        await bdx.connect(ownerUser).approve(vesting.address, to_d18(amount));
        await vesting.connect(ownerUser).schedule(ownerUser.address, to_d18(amount));

        await moveTimeForwardBy(vestingTimeSeconds)

        const balanceBeforeClaim = await bdx.balanceOf(ownerUser.address);
        await vesting.connect(ownerUser).claim();
        const balanceAfterClaim = await bdx.balanceOf(ownerUser.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(to_d18(amount * 2));
    });

    it('claim should transfer partial amount after vesting is halfway done', async () => {
        const amount = 1;
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(ownerUser).approve(vesting.address, to_d18(amount));
        await vesting.connect(ownerUser).schedule(ownerUser.address, to_d18(amount));

        await moveTimeForwardBy(vestingTimeSeconds.div(2))

        const balanceBeforeClaim = await bdx.balanceOf(ownerUser.address);
        await vesting.connect(ownerUser).claim();
        const balanceAfterClaim = await bdx.balanceOf(ownerUser.address);

        const transferredAmount = balanceAfterClaim.sub(balanceBeforeClaim);
        const expectedAmount = to_d18(amount / 2)
        const diff = transferredAmount.sub(expectedAmount);

        expect(diff, 'Diff negative').to.gte(0);
        expect(diff, 'Diff too big').to.lt(expectedAmount.div(1000));
    });

    it('claim should transfer full when claimed halfway through and after vesting ended', async () => {
        const amount = 1;
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(ownerUser).approve(vesting.address, to_d18(amount));
        await vesting.connect(ownerUser).schedule(ownerUser.address, to_d18(amount));

        const balanceBeforeClaim = await bdx.balanceOf(ownerUser.address);
        await moveTimeForwardBy(vestingTimeSeconds.div(2));
        await vesting.connect(ownerUser).claim();
        await moveTimeForwardBy(vestingTimeSeconds);
        await vesting.connect(ownerUser).claim();
        const balanceAfterClaim = await bdx.balanceOf(ownerUser.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(to_d18(amount));
    });

    it('claim should not transfer rewards to different user', async () => {
        const amount = 1;
        const vestingTimeSeconds = await vesting.vestingTimeInSeconds();

        await bdx.connect(ownerUser).approve(vesting.address, to_d18(amount));
        await vesting.connect(ownerUser).schedule(ownerUser.address, to_d18(amount));

        await moveTimeForwardBy(vestingTimeSeconds)

        const balanceBeforeClaim = await bdx.balanceOf(testUser1.address);
        await vesting.connect(testUser1).claim();
        const balanceAfterClaim = await bdx.balanceOf(testUser1.address);

        expect(balanceAfterClaim.sub(balanceBeforeClaim)).to.be.eq(to_d18(0));
    });
});