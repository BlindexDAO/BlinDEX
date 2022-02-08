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
import { bigNumberToDecimal } from "../utils/NumbersHelpers";
import { getAllUniswapPairsData } from "./liquidity-pools";

export function load() {
  task("bdx:show:diagnostics").setAction(async (args, hre) => {
    const bdx = await getBdx(hre);
    let bdxTotalSupply = await bdx.totalSupply();
    console.log("BDX Total Supply:", bigNumberToDecimal(bdxTotalSupply, 18).toLocaleString());

    const [srd, stables] = await Promise.all([getStakingRewardsDistribution(hre), getAllBDStables(hre)]);
    const operationalTreasuryAddress = hre.network.name === "rsk" ? rskOperationalTreasuryAddress : (await getOperationalTreasury(hre)).address;
    const treasuryAddress = hre.network.name === "rsk" ? rskTreasuryAddress : (await getTreasury(hre)).address;

    for (const stable of stables) {
      console.log(`${await stable.symbol()}: -${bigNumberToDecimal(await bdx.balanceOf(stable.address), 18).toLocaleString()}`);
      bdxTotalSupply = bdxTotalSupply.sub(await bdx.balanceOf(stable.address));
    }

    const [treasuryBalance, srdBalance, operationalTreasuryBalance] = await Promise.all([
      bdx.balanceOf(treasuryAddress),
      bdx.balanceOf(srd.address),
      bdx.balanceOf(operationalTreasuryAddress)
    ]);

    console.log(`Treasury: -${bigNumberToDecimal(treasuryBalance, 18).toLocaleString()}`);
    console.log(`Operational Treasury: -${bigNumberToDecimal(operationalTreasuryBalance, 18).toLocaleString()}`);
    console.log(`Staking Rewards Distribution (anything in staking/vesting): -${bigNumberToDecimal(srdBalance, 18).toLocaleString()}`);

    bdxTotalSupply = bdxTotalSupply.sub(treasuryBalance).sub(srdBalance).sub(operationalTreasuryBalance);

    if (hre.network.name === "rsk") {
      const lockingContractBalance = await bdx.balanceOf(bdxLockingContractAddressRSK);
      bdxTotalSupply = bdxTotalSupply.sub(lockingContractBalance);
      console.log(`Locking contract: -${bigNumberToDecimal(lockingContractBalance, 18).toLocaleString()}`);
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

    const bdxTotalSupply_d18 = bigNumberToDecimal(bdxTotalSupply, 18);
    console.log("\n=======================================================================");
    const bdxPriceUSD = bigNumberToDecimal(await (await getBdUs(hre)).BDX_price_d12(), 12);
    console.log(`BDX Price $${bdxPriceUSD.toLocaleString()}`);
    console.log(`BDX Marketcap $${(bdxPriceUSD * bdxTotalSupply_d18).toLocaleString()}`);
    console.log(`BDX Circulating Supply: ${bdxTotalSupply_d18.toLocaleString()}`);
    console.log("\nOut of that amount, we have this amount of BDX in the uniswap pools:");
    const bdxInPools = await getBdxInUniswapPools(hre, bdx);
    console.log(`\n- And outside of the pools: ${(bdxTotalSupply_d18 - bdxInPools).toLocaleString()}`);
    console.log("=========================================================================");
  });
}
