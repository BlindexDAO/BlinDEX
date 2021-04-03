import { BigNumber } from 'ethers';
import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { WETH } from "../../typechain/WETH";
import { BDStable } from "../../typechain/BDStable";
import { BdStablePool } from "../../typechain/BdStablePool";
import { UniswapV2Router02 } from "../../typechain/UniswapV2Router02";
import { LiquidityRewardsManager } from "../../typechain/LiquidityRewardsManager";
import { UniswapV2Factory } from "../../typechain/UniswapV2Factory";
import { ERC20 } from "../../typechain/ERC20";
import TimeTraveler from "../../utils/TimeTraveler"
import { BDXShares } from '../../typechain/BDXShares';

chai.use(solidity);
const { expect } = chai;
describe("LiquidityRewardsManager", () => {
  const timeTraveler = new TimeTraveler(hre.network.provider)

  describe("BDX accruing through liquidity mining", () => {
    it("should toggle collateral price", async () => {
      const poolOwnerAccount = await hre.ethers.getNamedSigner('POOL_CREATOR')
      const deployerAccount = await hre.ethers.getNamedSigner('DEPLOYER_ADDRESS')
      const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

      const weth = await hre.ethers.getContractAt("WETH", WETH_ADDRESS, poolOwnerAccount) as unknown as WETH;
      const bdStablePool = await hre.ethers.getContract('BDEUR_WETH_POOL', poolOwnerAccount) as unknown as BdStablePool
      const bdEur = await hre.ethers.getContract('BDEUR', poolOwnerAccount) as unknown as BDStable
      const bdx = await hre.ethers.getContract('BDXShares', poolOwnerAccount) as unknown as BDXShares
      const uniswapV2Router02 = await hre.ethers.getContract('UniswapV2Router02', poolOwnerAccount) as unknown as UniswapV2Router02
      const liquidityRewardsManager = await hre.ethers.getContract('LiquidityRewardsManager', poolOwnerAccount) as unknown as LiquidityRewardsManager
      const uniswapFactory = await hre.ethers.getContract("UniswapV2Factory", poolOwnerAccount) as unknown as UniswapV2Factory;

      await weth.deposit({ value: (1 * 1e18).toFixed(0) });

      // todo ag mock function, should be replaced in the future
      // extracts collateral form user's account
      // assings bdeur to the user
      await bdStablePool.mintBdStable((5 * 1e18).toFixed(0));

      // add liquidity to the uniswap pool (weth-bdeur)
      // reveive LP tokens
      await weth.approve(uniswapV2Router02.address, (1 * 1e18).toFixed(0));
      await bdEur.approve(uniswapV2Router02.address, (5 * 1e18).toFixed(0));

      const currentBlock = await hre.ethers.provider.getBlock("latest");
      // get swap pair (bdeur-weth)
      const pairAddress = await uniswapFactory.getPair(bdEur.address, weth.address);

      const lpToken = await hre.ethers.getContractAt("ERC20", pairAddress, poolOwnerAccount) as unknown as ERC20; // bdeur-weth pair
      // router routes to the proper pair
      await uniswapV2Router02.addLiquidity(weth.address, bdEur.address, (1 * 1e18).toFixed(0), (5 * 1e18).toFixed(0), (1 * 1e18).toFixed(0), (5 * 1e18).toFixed(0), poolOwnerAccount.address, currentBlock.timestamp + 60);

      // approve LP tokens transfer to the liquidity rewards manager
      const amount = (10n ** 30n).toString();
      await lpToken.approve(liquidityRewardsManager.address, amount); // for test reasens we approve "any" value

      const depositedLPToken = 2;

      // bdeur-weth pool index
      // should be extracted either by looping throug all the pools of cached outside blockchain
      const bdEurWethPid = 0;
      await liquidityRewardsManager.deposit(bdEurWethPid, (depositedLPToken * 1e18).toFixed(0));



      // var anotherSigner = await hre.ethers.getNamedSigner('TEST_USER');
      // await liquidityRewardsManager.connect(anotherSigner);
      
      // await liquidityRewardsManager.connect(poolOwnerAccount);



      // simulate elapsed time
      const minutesInDay = 60*24;
      const secondsInDay = minutesInDay*60;
      const days = 3;
      await timeTraveler.increaseTime(days*secondsInDay);

      await liquidityRewardsManager.withdraw(bdEurWethPid, (depositedLPToken * 1e18).toFixed(0));
      // assert bdx was rewarded
      
      const erc20Precision = BigNumber.from(10).pow(18);

      const bdxFirstYearSchedule = BigNumber.from(10500000).mul(erc20Precision).mul(20).div(100);
      const bdxPerMinute = bdxFirstYearSchedule.div(365*24*60)

      console.log(`BDX per minute: ${bdxPerMinute}`);

      const totalDeposits = depositedLPToken;
      const userDeposits = depositedLPToken;

      const minutesSinceLastReward = days*60*24;

      console.log(`Minues: ${minutesSinceLastReward}`);
      console.log(`userDeposits: ${userDeposits}`);
      console.log(`totalDeposits: ${totalDeposits}`);

      const expectedReward = bdxPerMinute.mul(minutesSinceLastReward).mul(userDeposits).div(totalDeposits);
      const bdxReward = await bdx.balanceOf(poolOwnerAccount.address);
      
      console.log(`Expected Bdx reward: ${expectedReward}`);
      console.log(`Bdx reward:          ${bdxReward}`);

      expect(bdxReward).to.eq(expectedReward);
    });
  })
});