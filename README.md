## First compilation

### Create `.env` file at root level, fill it with values
#### (please note that the private keys below are valid, but random and public, use them only for development purposes. Or even better, replace them with your own development keys)
```
MAINNET_URL=https://eth-mainnet.alchemyapi.io/v2/B0WJVmsIMZtbxO51kMf6ExQXmCfxoEpL
MNEMONIC_PHRASE=put a development seed phrase here
USER_DEPLOYER_PRIVATE_KEY=472a082c0ea7300773c6fb27b3b3215807da7cb9ab4ca2ae0763eb5deb10725d
USER_TREASURY_PRIVATE_KEY=472a082c0ea7300773c6fb27b3b3215807da7cb9ab4ca2ae0763eb5deb10725d
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
npm run deploy:fork -- --reset
npm run test:integrations
```

## Lint tool
```bash
npm run solhint
```

## Generate abis and typings

```bash
npm run npm-package
```

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
* FRAX (https://github.com/FraxFinance/frax-solidity)
* Uniswap (https://github.com/Uniswap/v2-core)