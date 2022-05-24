import { task } from "hardhat/config";
import { getAllBDStablePools, getBdx, getCollateralContract, getTokenData } from "../utils/DeployedContractsHelpers";
import { d12_ToNumber, d18_ToNumber, to_d18 } from "../utils/NumbersHelpers";
import { utils } from "ethers";
import { toRc } from "../utils/Recorder/RecordableContract";
import { defaultRecorder } from "../utils/Recorder/Recorder";

export function load() {
  task("bdsp:all:show").setAction(async (args, hre) => {
    const stablePools = await getAllBDStablePools(hre);

    for (let index = 0; index < stablePools.length; index++) {
      const stablePool = stablePools[index];
      console.log(`\nBDStablePool address: ${stablePool.address}`);
    }
  });

  task("bdsp:buyback")
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

  task("bdsp:recollateralize")
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

      const tax = await (
        await stablePool.recollateralizeBdStable(preciseMaxCollateralAmount, to_d18(minExpectedBDX), useNativeToken, {
          value: useNativeToken ? preciseMaxCollateralAmount : 0
        })
      ).wait();

      const recollateralizedEvent = tax.events?.find(event => event.event === "Recollateralized");
      if (!recollateralizedEvent) {
        console.log("No tokens were recollateralized");
      } else if (recollateralizedEvent.args?.length) {
        console.log("Paid collateral:", d18_ToNumber(recollateralizedEvent.args[0]));
        console.log("BDX recieved:", d18_ToNumber(recollateralizedEvent.args[1]));
      }
    });

  task("bdsp:all:toggle:buybackOnlyForOwner").setAction(async (args, hre) => {
    const recorder = await defaultRecorder(hre);

    const stablePools = await getAllBDStablePools(hre);

    for (let index = 0; index < stablePools.length; index++) {
      const stablePool = stablePools[index];
      console.log("\nBDStablePool address:", stablePool.address);
      console.log("Before: buybackOnlyForOwner:", await stablePool.buybackOnlyForOwner());
      await toRc(stablePool, recorder).record.toggleBuybackOnlyForOwner();
    }

    await recorder.execute();
  });

  task("bdsp:all:toggle:recollateralizeOnlyForOwner").setAction(async (args, hre) => {
    const recorder = await defaultRecorder(hre);

    const stablePools = await getAllBDStablePools(hre);

    for (let index = 0; index < stablePools.length; index++) {
      const stablePool = stablePools[index];
      console.log("\nBDStablePool address:", stablePool.address);
      console.log("Before: recollateralizeOnlyForOwner:", await stablePool.recollateralizeOnlyForOwner());
      await toRc(stablePool, recorder).record.toggleRecollateralizeOnlyForOwner();
    }

    await recorder.execute();
  });

  task("bdsp:all:recollateralize:set:fee")
    .addPositionalParam("newRecollateralizationFee", "The new recollateralization fee")
    .setAction(async ({ newRecollateralizationFee }, hre) => {
      const stablePools = await getAllBDStablePools(hre);

      for (let index = 0; index < stablePools.length; index++) {
        const stablePool = stablePools[index];
        console.log("\nBDStablePool address:", stablePool.address);
        console.log("Fee before:", `${d12_ToNumber(await stablePool.recollat_fee()) * 100}%`);
        const [pool_ceiling, bonus_rate, redemption_delay, minting_fee, redemption_fee, buyback_fee] = await Promise.all([
          stablePool.pool_ceiling(),
          stablePool.bonus_rate(),
          stablePool.redemption_delay(),
          stablePool.minting_fee(),
          stablePool.redemption_fee(),
          stablePool.buyback_fee()
        ]);
        await (
          await stablePool.setPoolParameters(
            pool_ceiling,
            bonus_rate,
            redemption_delay,
            minting_fee,
            redemption_fee,
            buyback_fee,
            newRecollateralizationFee
          )
        ).wait();
        console.log("Fee after:", `${d12_ToNumber(await stablePool.recollat_fee()) * 100}%`);
      }
    });

  task("bdsp:all:recollateralize:set:bonus")
    .addPositionalParam("newRecollateralizationBonusD12", "The new recollateralization bonus - d12")
    .setAction(async ({ newRecollateralizationBonusD12 }, hre) => {
      const stablePools = await getAllBDStablePools(hre);

      for (let index = 0; index < stablePools.length; index++) {
        const stablePool = stablePools[index];
        console.log("\nBDStablePool address:", stablePool.address);
        console.log("Bonus before:", `${d12_ToNumber(await stablePool.bonus_rate()) * 100}%`);
        const [pool_ceiling, redemption_delay, minting_fee, redemption_fee, buyback_fee, recollat_fee] = await Promise.all([
          stablePool.pool_ceiling(),
          stablePool.redemption_delay(),
          stablePool.minting_fee(),
          stablePool.redemption_fee(),
          stablePool.buyback_fee(),
          stablePool.recollat_fee()
        ]);
        await (
          await stablePool.setPoolParameters(
            pool_ceiling,
            newRecollateralizationBonusD12,
            redemption_delay,
            minting_fee,
            redemption_fee,
            buyback_fee,
            recollat_fee
          )
        ).wait();
        console.log("Bonus after:", `${d12_ToNumber(await stablePool.bonus_rate()) * 100}%`);
      }
    });
}
