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

chai.use(solidity);
const { expect } = chai;
describe("LiquidityRewardsManager", async () => {
  const poolOwnerAccount = await hre.ethers.getNamedSigner('POOL_CREATOR')
  const deployerAccount = await hre.ethers.getNamedSigner('DEPLOYER_ADDRESS')
  const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

  const weth = await hre.ethers.getContractAt("WETH", WETH_ADDRESS) as unknown as WETH;

  describe("BDX accruing thouth liquidity mining", async () => {
    it("should toggle collateral price", async () => {
      
      const bdStablePool = await hre.ethers.getContract('BDEUR_WETH_POOL', poolOwnerAccount) as unknown as BdStablePool
      const bdEur = await hre.ethers.getContract('BDEUR', poolOwnerAccount) as unknown as BDStable
      const uniswapV2Router02 = await hre.ethers.getContract('UniswapV2Router02', poolOwnerAccount) as unknown as UniswapV2Router02
      const liquidityRewardsManager = await hre.ethers.getContract('LiquidityRewardsManager', poolOwnerAccount) as unknown as LiquidityRewardsManager
      const uniswapFactory = await hre.ethers.getContract("UniswapV2Factory") as unknown as UniswapV2Factory;

      await weth.deposit({value: 1*1e18});

      // todo ag mock function, should be replaced in the future
      // extracts collateral form user's account
      // assings bdeur to the user
      await bdStablePool.mintBdStable(5*1e18);

      // add liquidity to the uniswap pool (weth-bdeur)
      // reveive LP tokens
      await weth.approve(uniswapV2Router02.address, 1*1e18);
      await bdEur.approve(uniswapV2Router02.address, 5*1e18);
      const currentBlock = await hre.ethers.provider.getBlock("latest");
      // router routes to the proper pair
      await uniswapV2Router02.addLiquidity(weth.address, bdEur.address, 1*1e18, 5*1e18, 1*1e18, 5*1e18, poolOwnerAccount.address, currentBlock.timestamp + 60);

      // get swap pair (bdeur-weth)
      // approve LP tokens transfer to the liquidity rewards manager
      const pairAddress = await uniswapFactory.getPair(bdEur.address, weth.address);
      const lpToken = await hre.ethers.getContractAt("ERC20", pairAddress) as unknown as ERC20; // bdeur-weth pair
      await lpToken.approve(liquidityRewardsManager.address, 1e30); // for test reasens we approve "any" value

      // bdeur-weth pool index
      // should be extracted either by looping throug all the pools of cached outside blockchain
      const bdEurWethPid = 0;
      await liquidityRewardsManager.deposit(bdEurWethPid, 2*1e18);

      // todo simulate elapsed time

      await liquidityRewardsManager.withdraw(bdEurWethPid, 2*1e18);

      // assert bdx was rewarded
      // expect(price).to.eq(1000);
    });
  })
});