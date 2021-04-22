import { BigNumber } from 'ethers';
import hre from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ChainlinkBasedCryptoFiatFeed } from '../../typechain/ChainlinkBasedCryptoFiatFeed';
import cap from "chai-as-promised";

import { bigNumberToDecmal } from "../../utils/Helpers";
import { experimentalAddHardhatNetworkMessageTraceHook } from 'hardhat/config';

chai.use(cap);

chai.use(solidity);
const { expect } = chai;

describe("Oracles", async () => {
    const ownerUser = await hre.ethers.getNamedSigner('POOL_CREATOR');

    it("should get eth/eur price", async () => {
        const chainlinkBasedCryptoFiatFeed_ETH_EUR = await hre.ethers.getContract('ChainlinkBasedCryptoFiatFeed_ETH_EUR', ownerUser) as unknown as ChainlinkBasedCryptoFiatFeed;

        const price = await chainlinkBasedCryptoFiatFeed_ETH_EUR.getPrice_1e12();
        
        const priceDecimal = bigNumberToDecmal(price, 12);

        console.log("ETH/EUR price: " + priceDecimal);

        expect(priceDecimal).to.be.gt(1000);
        expect(priceDecimal).to.be.lt(3000);
    })

    it("should get btc/eur price", async () => {
        const chainlinkBasedCryptoFiatFeed_BTC_EUR = await hre.ethers.getContract('ChainlinkBasedCryptoFiatFeed_BTC_EUR', ownerUser) as unknown as ChainlinkBasedCryptoFiatFeed;

        const price = await chainlinkBasedCryptoFiatFeed_BTC_EUR.getPrice_1e12();
        
        const priceDecimal = bigNumberToDecmal(price, 12);

        console.log("BTC/EUR price: " + priceDecimal);

        expect(priceDecimal).to.be.gt(40000);
        expect(priceDecimal).to.be.lt(60000);
    })
})