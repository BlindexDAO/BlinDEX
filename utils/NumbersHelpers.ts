import { BigNumber } from "ethers";

export function to_d18(n: number): BigNumber {
  return numberToBigNumberFixed(n, 18);
}

export function to_d12(n: number): BigNumber {
  return numberToBigNumberFixed(n, 12);
}

export function to_d8(n: number): BigNumber {
  return numberToBigNumberFixed(n, 8);
}

export function numberToBigNumberFixed(n: number, decimals: number): BigNumber {
  const precision = 1e6;
  n = Math.round(n * precision);
  return BigNumber.from(10).pow(decimals).mul(n).div(precision);
}

export function d18_ToNumber(n: BigNumber): number {
  return bigNumberToDecimal(n, 18);
}

export function d12_ToNumber(n: BigNumber): number {
  return bigNumberToDecimal(n, 12);
}

export function bigNumberToDecimal(n: BigNumber, decimals: number) {
  return Number(n.toString()) / 10 ** decimals;
}

export function diffPct(a: BigNumber, b: BigNumber) {
  if (a.toString() === "0" && b.toString() === "0") {
    return 0;
  } else if (a.toString() === "0") {
    return Infinity;
  } else {
    return (a.sub(b).mul(1e6).div(a).toNumber() / 1e6) * 100;
  }
}

export function diffPctN(a: number, b: number) {
  return (a - b) / a;
}
