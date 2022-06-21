import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BigNumber } from "ethers";
import { UniswapV2Router02 } from "../../typechain/UniswapV2Router02";
import { getDeployer, getUniswapRouter, getWeth } from "../../utils/DeployedContractsHelpers";
import { getPairsOraclesAndSymbols } from "../../utils/UniswapPoolsHelpers";

//this function wraps best route logic with proper initialization
export async function getTestBestRoute(
  hre: HardhatRuntimeEnvironment,
  amount: BigNumber,
  invokeGetAmountsIn: boolean,
  leftTokenAddress: string,
  rightTokenAddress: string
) {
  const deployer = await getDeployer(hre);
  const pairs = (await getPairsOraclesAndSymbols(hre, deployer)).map(pairInfo => pairInfo.pair);
  const availableLinks = [];

  for (const pair of pairs) {
    availableLinks.push({ from: pair.token0.toLowerCase(), to: pair.token1.toLowerCase() });
    availableLinks.push({ from: pair.token1.toLowerCase(), to: pair.token0.toLowerCase() });
  }
  const wethAddress = (await getWeth(hre)).address;

  const router = await getUniswapRouter(hre);
  const bestRoute = await getBestRoute(
    router,
    amount,
    invokeGetAmountsIn,
    leftTokenAddress.toLowerCase(),
    rightTokenAddress.toLowerCase(),
    wethAddress,
    availableLinks
  );
  return bestRoute;
}

const nativeAddressKeyword = "NATIVE";
function toAddressIfNative(tokenAddressOrNativeKeyword: string, wethAddress: string): string {
  return tokenAddressOrNativeKeyword === nativeAddressKeyword ? wethAddress : tokenAddressOrNativeKeyword;
}

async function getBestRoute(
  router: UniswapV2Router02,
  amount: BigNumber,
  invokeGetAmountsIn: boolean,
  leftTokenAddress: string,
  rightTokenAddress: string,
  wethAddress: string,
  availableLinks: { from: string; to: string }[]
): Promise<{ route: string[]; finalAmount: BigNumber; amounts: BigNumber[] }> {
  const leftTokenAddressParsed = leftTokenAddress === nativeAddressKeyword ? toAddressIfNative(leftTokenAddress, wethAddress) : leftTokenAddress;
  const rightTokenAddressParsed = rightTokenAddress === nativeAddressKeyword ? toAddressIfNative(rightTokenAddress, wethAddress) : rightTokenAddress;

  const allRoutes = await generateRoutes(leftTokenAddressParsed, rightTokenAddressParsed, availableLinks);
  const allRoutesWithAmounts = await getRoutesWithAmount(router, allRoutes, amount, invokeGetAmountsIn);
  const bestRoute = await chooseBestRoute(allRoutesWithAmounts, invokeGetAmountsIn);
  return bestRoute;
}

export async function getRoutesWithAmount(
  router: UniswapV2Router02,
  routes: string[][],
  amount: BigNumber,
  invokeGetAmountsIn: boolean
): Promise<{ route: string[]; finalAmount: BigNumber; amounts: BigNumber[] }[]> {
  const routesPrices = [];
  for (const route of routes) {
    let amounts;
    try {
      amounts = invokeGetAmountsIn ? await router.getAmountsIn(amount, route) : await router.getAmountsOut(amount, route);
    } catch (e) {
      console.log("Error getting routes: " + e);
      continue;
    }

    routesPrices.push({
      route: route,
      finalAmount: invokeGetAmountsIn ? amounts[0] : amounts[amounts.length - 1],
      amounts: amounts
    });
  }

  return routesPrices;
}

async function generateRoutes(addressIn: string, addressOut: string, availableLinks: { from: string; to: string }[]): Promise<string[][]> {
  const midTokens = [];

  for (const link1 of availableLinks) {
    if (link1.from !== addressIn) {
      continue;
    }
    for (const link2 of availableLinks) {
      if (link1.to !== link2.from) {
        continue;
      }
      if (link2.to !== addressOut) {
        continue;
      }

      midTokens.push(link1.to);
    }
  }
  const routes = [...midTokens.map(x => [addressIn, x, addressOut])];
  if (availableLinks.some(link => link.from === addressIn && link.to === addressOut)) {
    routes.push([addressIn, addressOut]);
  }

  return routes;
}

async function chooseBestRoute(
  routesInfos: { route: string[]; finalAmount: BigNumber; amounts: BigNumber[] }[],
  invokeGetAmountsIn: boolean
): Promise<{ route: string[]; finalAmount: BigNumber; amounts: BigNumber[] }> {
  const bestPath = routesInfos.reduce((prev, current) => {
    const selectedRouteInfo = invokeGetAmountsIn
      ? prev.finalAmount.lt(current.finalAmount) || (prev.finalAmount.eq(current.finalAmount) && prev.route.length < current.route.length)
        ? prev
        : current
      : prev.finalAmount.gt(current.finalAmount) || (prev.finalAmount.eq(current.finalAmount) && prev.route.length < current.route.length)
      ? prev
      : current;

    return selectedRouteInfo;
  });

  return bestPath;
}
