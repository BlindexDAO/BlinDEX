![MEDIUM HEADER 1500x750px_](https://user-images.githubusercontent.com/1577655/147810830-1b200126-47d1-4a78-a95a-45a8c8a105cc.png)

# Blindex

Blindex is the first **multi-currency stablecoin-based DeFi platform** that sees all currencies as equals.
Replacing all traditional financial systems calls for a completely stable, inclusive, and **100% decentralized** alternative. We don't play around with centralized collateral.

💻 [Website](https://blindex.io)

📱 [App](https://app.blindex.io/)

📜 [Docs](https://docs.blindex.io/)

♣️ [Discord](https://discord.gg/dbN2bmJ42u)

💬 [Telegram](https://t.me/Blindexio)

🤳 [Twitter](https://twitter.com/Blindexio)

# Development

## Environment variables

Create `.env` file at root level, fill it with the following **mandatory** values:

```
MAINNET_URL=https://eth-mainnet.alchemyapi.io/v2/<your_personal_eth-mainnet_alchemyapi_project_token>
MNEMONIC_PHRASE=fashion night boss nature jelly resource mechanic faculty message into drastic strike
USER_DEPLOYER_PRIVATE_KEY=472a082c0ea7300773c6fb27b3b3215807da7cb9ab4ca2ae0763eb5deb10725d
USER_TREASURY_PRIVATE_KEY=472a082c0ea7300773c6fb27b3b3215807da7cb9ab4ca2ae0763eb5deb10725d
USER_BOT_PRIVATE_KEY=472a082c0ea7300773c6fb27b3b3215807da7cb9ab4ca2ae0763eb5deb10725d
GOERLI_URL=<your RPC URL - reach out to the other team members to understand how to get it. You can also just get it by setting up a free alchemyapi or infura accounts>
KOVAN_URL=<your RPC URL - reach out to the other team members to understand how to get it. You can also just get it by setting up a free alchemyapi or infura accounts>
```

And you may also use these **optional** values:

```
CMC_TOKEN=your_coin_market_cap_token
ETHERSCAN_API_KEY=<token>
ARBITRUM_TESTNET_URL=<your RPC URL - reach out to the other team members to understand how to get it. You can also just get it by setting up a free alchemyapi or infura accounts>
```

Please note that the private keys and seed phrase above are valid, but random and public, use them only for development purposes. Or even better, replace them with your own development keys.

## Compile

```bash
npm install
npm run compile
```

## Local Development

```bash
npm run node
```

And on a second window run:

```bash
npm start
```

## Running tests

```bash
npm run node
```

And on a second window run:

```bash
npm test
```

If you also want to see the gas usage of your tests, run:

```bash
npm run test:gas
```

## @blindex/interfaces npm package

We reuse code between our blockchain & frontend apps. For that reason we have the `@blindex/interfaces` npm package that can be used to import all of Blindex's ABIs & Typescript types.
Enjoy!

# Technical documentation

- [Upgrading contracts as a multi-sig owner](documentation/upgrading-contracts.md)
- [Running tasks with multisig](documentation/running-tasks-with-multisig.md)

# Accounts

Blindex uses 3 accounts.

### Deployer account

The owner of every owned contract.

### Treasury account

The holder of BDX reserves.

### Bot account

The account responsible for updating oracles and refreshing other parts of the system e.g. collateral ratio.

# Audits

We take security very seriously. Therefore the Blindex protocol had and will been go through security Audits.
You can find the audits we did so far [in our docs](https://docs.blindex.io/smart-contracts/audits).

# Etherscan auto verify contracts

All you have to do is get your `ETHERSCAN_API_KEY` in the `.env` file and then run:

```shell
npx hardhat verify --network <network> DEPLOYED_CONTRACT_ADDRESS
```

# Credits

We're grateful to the following projects for sharing their code and packages, used in this project:

- [FRAX](https://github.com/FraxFinance/frax-solidity)
- [Uniswap](https://github.com/Uniswap/v2-core)
- [Sovryn](https://github.com/DistributedCollective/Sovryn-smart-contracts)
