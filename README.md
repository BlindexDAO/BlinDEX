## First compilation

### Create `.env` file at root level, fill it with values
```
MAINNET_URL=https://eth-mainnet.alchemyapi.io/v2/B0WJVmsIMZtbxO51kMf6ExQXmCfxoEpL
MNEMONIC_PHRASE=put a development seed phrase here
USER_DEPLOYER_PRIVATE_KEY=<if you want to deploy the contract to an external network add deployer private key here otherwise leave empty>
USER_TREASURY_PRIVATE_KEY=<if you want to deploy the contract to an external network add treasury private key here otherwise leave empty>
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
npm run test:integrations
```

## Generate abis and typings

```bash
npm run npm-package
```
