import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { IOracleBasedCryptoFiatFeed } from "../../typechain/IOracleBasedCryptoFiatFeed";
import type { BtcToEthOracleChinlink } from "../../typechain/BtcToEthOracleChinlink";
import cap from "chai-as-promised";

import { bigNumberToDecimal } from "../../utils/NumbersHelpers";

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Chainlink besed Oracles", () => {
  before(async () => {
    await hre.deployments.fixture();
  });

  it("should get eth/eur price", async () => {
    const ownerUser = await hre.ethers.getNamedSigner("DEPLOYER");

    const oracleBasedCryptoFiatFeed_ETH_EUR = (await hre.ethers.getContract(
      "OracleBasedCryptoFiatFeed_ETH_EUR",
      ownerUser
    )) as IOracleBasedCryptoFiatFeed;

    const price = await oracleBasedCryptoFiatFeed_ETH_EUR.getPrice_1e12();

    const priceDecimal = bigNumberToDecimal(price, 12);

    console.log("ETH/EUR price: " + priceDecimal);

    expect(priceDecimal).to.be.gt(1000);
    expect(priceDecimal).to.be.lt(5000);
  });

  it("should get btc/eth price", async () => {
    const ownerUser = await hre.ethers.getNamedSigner("DEPLOYER");
    const btcToEthOracle = (await hre.ethers.getContract("BtcToEthOracle", ownerUser)) as BtcToEthOracleChinlink;

    const price = await btcToEthOracle.getPrice_1e12();

    const priceDecimal = bigNumberToDecimal(price, 12);

    console.log("BTC / ETH price: " + priceDecimal);

    expect(priceDecimal).to.be.closeTo(19.0, 5);
  });
});
