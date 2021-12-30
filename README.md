## First compilation

### Create `.env` file at root level, fill it with values

#### (please note that the private keys below are valid, but random and public, use them only for development purposes. Or even better, replace them with your own development keys)

```
MAINNET_URL=https://eth-mainnet.alchemyapi.io/v2/B0WJVmsIMZtbxO51kMf6ExQXmCfxoEpL
MNEMONIC_PHRASE=put a development seed phrase here
USER_DEPLOYER_PRIVATE_KEY=472a082c0ea7300773c6fb27b3b3215807da7cb9ab4ca2ae0763eb5deb10725d
USER_TREASURY_PRIVATE_KEY=472a082c0ea7300773c6fb27b3b3215807da7cb9ab4ca2ae0763eb5deb10725d
USER_BOT_PRIVATE_KEY=472a082c0ea7300773c6fb27b3b3215807da7cb9ab4ca2ae0763eb5deb10725d
CMC_TOKEN=your_coin_market_cap_token
```

### Run commands

```bash
npm install
npm run compile
```

## Local Development

```bash
npm run node
# second window
npm run deploy:fork -- --reset
npm run initialize
```

## Running tests

```bash
npm run node
# second window
npm run deploy:fork:reset
npm test
```

## Lint tool

```bash
npm run solhint
```

## Update version & publish @blindex/interfaces npm package

### Old way - soon to be deprecated

This way of preparing the package to be consumed by the FE & BE will be deprecated soon as part of these tasks:

- https://lagoslabs.atlassian.net/browse/LAGO-230
- https://lagoslabs.atlassian.net/browse/LAGO-231
- https://lagoslabs.atlassian.net/browse/LAGO-229

Just run:

```bash
npm run npm-package
```

### New way of doing things

Will be the only way once we work on this task:

- https://lagoslabs.atlassian.net/browse/LAGO-229

#### Update version

```bash
npm run blindex-package <semver_version>
```

`semver_version` must be a valid semver format. It must also be greater than the current version which could be be found [here](./@blindex/interfaces/package.json).

#### Publish

Open a pull request with your changes after you upgrades the version of the npm package.
Once your pull request will be merged, our Github action on the `master` branch will publish the package for you. So just look at the [actions tab](https://github.com/BlindexDAO/BlinDEX/actions) on the github repo.

# Accounts

Blindex uses 4 accounts. Deployer and Treasury will be converted to multisig accounts after deployment

## Deployer account

The owner of every owned contract.

## Treasury account

The holder of BDX reserves.

## Bot account

The account responsible for updating oracles and refreshing other parts of the system e.g. collateral ratio.

## Dev treasury account

The account which accumulates fees to finace BlinDEX software development

# Credits

We're grateful to the following projects for sharing their code an packages, used in this project

- FRAX (https://github.com/FraxFinance/frax-solidity)
- Uniswap (https://github.com/Uniswap/v2-core)
