import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { BDXShares } from "../typechain/BDXShares";
import { bdxLockingContractAddressRSK, rskOperationalTreasuryAddress, rskTreasuryAddress } from "../utils/Constants";
import {
  getAllBDStables,
  getBdUs,
  getBdx,
  getOperationalTreasury,
  getStakingRewardsDistribution,
  getTreasury
} from "../utils/DeployedContractsHelpers";
import { d12_ToNumber, d18_ToNumber } from "../utils/NumbersHelpers";
import { getAllUniswapPairsData } from "./liquidity-pools";

export function load() {
  task("bdx:show:diagnostics").setAction(async (args, hre) => {
    const bdx = await getBdx(hre);
    let bdxTotalSupply_d18 = await bdx.totalSupply();
    console.log("BDX Total Supply:", d18_ToNumber(bdxTotalSupply_d18).toLocaleString());

    const [srd, stables] = await Promise.all([getStakingRewardsDistribution(hre), getAllBDStables(hre)]);
    const operationalTreasuryAddress = hre.network.name === "rsk" ? rskOperationalTreasuryAddress : (await getOperationalTreasury(hre)).address;
    const treasuryAddress = hre.network.name === "rsk" ? rskTreasuryAddress : (await getTreasury(hre)).address;

    for (const stable of stables) {
      console.log(`${await stable.symbol()}: -${d18_ToNumber(await bdx.balanceOf(stable.address)).toLocaleString()}`);
      bdxTotalSupply_d18 = bdxTotalSupply_d18.sub(await bdx.balanceOf(stable.address));
    }

    const [treasuryBalance, srdBalance, operationalTreasuryBalance] = await Promise.all([
      bdx.balanceOf(treasuryAddress),
      bdx.balanceOf(srd.address),
      bdx.balanceOf(operationalTreasuryAddress)
    ]);

    console.log(`Treasury: -${d18_ToNumber(treasuryBalance).toLocaleString()}`);
    console.log(`Operational Treasury: -${d18_ToNumber(operationalTreasuryBalance).toLocaleString()}`);
    console.log(`Staking Rewards Distribution (anything in staking/vesting): -${d18_ToNumber(srdBalance).toLocaleString()}`);

    bdxTotalSupply_d18 = bdxTotalSupply_d18.sub(treasuryBalance).sub(srdBalance).sub(operationalTreasuryBalance);

    if (hre.network.name === "rsk") {
      const lockingContractBalance = await bdx.balanceOf(bdxLockingContractAddressRSK);
      bdxTotalSupply_d18 = bdxTotalSupply_d18.sub(lockingContractBalance);
      console.log(`Locking contract: -${d18_ToNumber(lockingContractBalance).toLocaleString()}`);
    }

    async function getBdxInUniswapPools(hre: HardhatRuntimeEnvironment, bdx: BDXShares) {
      const uniswapPairsData = await getAllUniswapPairsData(hre);
      const bdxSymbol = await bdx.symbol();
      let bdxInPools = 0;

      for (const bdxPair of uniswapPairsData.filter(pairData => pairData.isBdxPool)) {
        const bdxReserves = (
          bdxPair[bdxSymbol] as {
            address: string;
            decimals: number;
            reserves: number;
          }
        ).reserves;
        bdxInPools += bdxReserves;

        console.log(`- ${bdxPair.pairName} uniswap pool: ${bdxReserves.toLocaleString()}`);
      }

      console.log(`\n- Total in the pools: ${bdxInPools.toLocaleString()}`);
      return bdxInPools;
    }

    const bdxTotalSupply = d18_ToNumber(bdxTotalSupply_d18);
    console.log("\n=======================================================================");
    const bdxPriceUSD = d12_ToNumber(await (await getBdUs(hre)).BDX_price_d12());
    console.log(`BDX Price $${bdxPriceUSD.toLocaleString()}`);
    console.log(`BDX Marketcap $${(bdxPriceUSD * bdxTotalSupply).toLocaleString()}`);
    console.log(`BDX Circulating Supply: ${bdxTotalSupply.toLocaleString()}`);
    console.log("\nOut of that amount, we have this amount of BDX in the uniswap pools:");
    const bdxInPools = await getBdxInUniswapPools(hre, bdx);
    console.log(`\n- And outside of the pools: ${(bdxTotalSupply - bdxInPools).toLocaleString()}`);
    console.log("=========================================================================");
  });
}
