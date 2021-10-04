## First compilation
```
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

```
npm run node
npm run deploy:fork -- --reset
npm run test:integrations
```

## Generate abis and typings

```
npm run npm-package
```
