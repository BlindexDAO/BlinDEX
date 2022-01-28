import { task } from "hardhat/config";
import { getAllBDStablePools, getBdx, getCollateralContract, getTokenData } from "../utils/DeployedContractsHelpers";
import { d18_ToNumber, to_d18 } from "../utils/NumbersHelpers";
import { utils } from "ethers";

export function load() {
  task("run:buyback")
    .addPositionalParam("stablePoolAddress", "The address of the stable pool we'd like to buyback")
    .addPositionalParam("maxBdxAmount", "Maximum BDX amount to be paid for the buyback")
    .addPositionalParam("minCollateralAmount", "Minimum collateral amount to buy back")
    .addPositionalParam("useNativeToken", "Indication whether to use the native token")
    .setAction(async ({ stablePoolAddress, maxBdxAmount, minCollateralAmount, useNativeToken }, hre) => {
      const stablePools = await getAllBDStablePools(hre);
      const stablePool = stablePools.find(pool => pool.address.toLowerCase() === stablePoolAddress.toLowerCase());
      if (!stablePool) {
        console.log(`Couldn't find pool ${stablePoolAddress}`);
        return;
      }

      const bdxAmount_d18 = to_d18(maxBdxAmount);
      const bdx = await getBdx(hre);
      await bdx.approve(stablePool.address, bdxAmount_d18);

      const res = await (await stablePool.buyBackBDX(bdxAmount_d18, to_d18(minCollateralAmount), useNativeToken)).wait();
      const boughtBackEvent = res.events?.find(event => event.event === "BoughtBack");
      if (!boughtBackEvent) {
        console.log("No tokens were bought back");
      } else if (boughtBackEvent.args?.length) {
        console.log("Paid BDX:", d18_ToNumber(boughtBackEvent.args[0]));
        console.log("Collateral bought back:", d18_ToNumber(boughtBackEvent.args[1]));
      }
    });

  task("run:recollateralize")
    .addPositionalParam("stablePoolAddress", "The address of the stable pool we'd like to recollateralize")
    .addPositionalParam("maxCollateralAmount", "Maximum amount of collateral to be paid")
    .addPositionalParam("minExpectedBDX", "Minimum amount of BDX we'd like to get in return for the recollateralization")
    .addPositionalParam("useNativeToken", "Indication whether to use the native token")
    .setAction(async ({ stablePoolAddress, maxCollateralAmount, minExpectedBDX, useNativeToken }, hre) => {
      const stablePools = await getAllBDStablePools(hre);
      const stablePool = stablePools.find(pool => pool.address.toLowerCase() === stablePoolAddress.toLowerCase());
      if (!stablePool) {
        console.log(`Couldn't find stable pool ${stablePoolAddress}`);
        return;
      }

      useNativeToken = useNativeToken.toLowerCase() === "true";

      const collateralTokenAddress = await stablePool.collateral_token();
      const { decimals } = await getTokenData(collateralTokenAddress, hre);
      const preciseMaxCollateralAmount = utils.parseUnits(maxCollateralAmount, decimals);

      if (!useNativeToken) {
        const collateralToken = await getCollateralContract(hre, collateralTokenAddress);
        await collateralToken.approve(stablePool.address, preciseMaxCollateralAmount);
      }

      const res = await (
        await stablePool.recollateralizeBdStable(preciseMaxCollateralAmount, to_d18(minExpectedBDX), useNativeToken, {
          value: useNativeToken ? preciseMaxCollateralAmount : 0
        })
      ).wait();

      const recollateralizedEvent = res.events?.find(event => event.event === "Recollateralized");
      if (!recollateralizedEvent) {
        console.log("No tokens were recollateralized");
      } else if (recollateralizedEvent.args?.length) {
        console.log("Paid collateral:", d18_ToNumber(recollateralizedEvent.args[0]));
        console.log("BDX recieved:", d18_ToNumber(recollateralizedEvent.args[1]));
      }
    });

  task("toggleAll:buybackOnlyForOwner").setAction(async (args, hre) => {
    const stablePools = await getAllBDStablePools(hre);

    for (let index = 0; index < stablePools.length; index++) {
      const stablePool = stablePools[index];
      console.log("\nBDStablePool address:", stablePool.address);
      console.log("Before: buybackOnlyForOwner:", await stablePool.buybackOnlyForOwner());
      await (await stablePool.toggleBuybackOnlyForOwner()).wait();
      console.log("After: buybackOnlyForOwner:", await stablePool.buybackOnlyForOwner());
    }
  });

  task("toggleAll:recollateralizeOnlyForOwner").setAction(async (args, hre) => {
    const stablePools = await getAllBDStablePools(hre);

    for (let index = 0; index < stablePools.length; index++) {
      const stablePool = stablePools[index];
      console.log("\nBDStablePool address:", stablePool.address);
      console.log("Before: recollateralizeOnlyForOwner:", await stablePool.recollateralizeOnlyForOwner());
      await (await stablePool.toggleRecollateralizeOnlyForOwner()).wait();
      console.log("After: recollateralizeOnlyForOwner:", await stablePool.recollateralizeOnlyForOwner());
    }
  });
}
