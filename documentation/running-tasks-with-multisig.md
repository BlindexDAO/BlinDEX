# Running tasks with multisig

Preparation

- Deploy Timelock contract
- Transfer Timelock contract ownership to multisig
- Transfer contracts' ownerships to Timelock

Workflow:

- Use RecordableContract, Recorder and TimelocStrategy classes to prepare transaction batch
- Queue transaction batch using Recorder
- Approve transaction batch
  - With multisig (if running on production)
  - With a task (if running a local instance)
- Execute approved transaction batch

Local workflow example

```
npm run start
npx hardhat --network mainnetFork change-owner-to-timelock
npx hardhat --network mainnetFork queue-change-owner-to-deployer
npx hardhat --network mainnetFork approve-timelock-transaction-by-txHash XXXX_txHashHere_XXXX
npx hardhat --network mainnetFork move-time-by-days 15
npx hardhat --network mainnetFork execute-timelock-transaction XXXX_txHashHere_XXXX

```
