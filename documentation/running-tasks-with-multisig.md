# Running tasks with multisig

Preparation

- Deploy Timelock contract
- Transfer Timelock contract ownership to multisig
- Transfer contracts' ownerships to Timelock

Workflow:

- Use RecordableContract, Recorder and TimelockStrategy classes to prepare transaction batch
- Queue transaction batch using Recorder
- Approve transaction batch
  - With multisig (if running on production)
  - With a task (if running a local instance)
- Execute approved transaction batch

## Test workflow example

Create a Gnosis safe which will be the owner of the timelock conctact.

Deploy Timelock:

```
npx hardhat --network rsk dev:deploy-timelock --proposer TX_PROPOSER_ADDRESS --owner GNOSIS_MULTISIG_SAFE_ADDRESS
```

In the terminal you can see the deployed Timelock address (TIMELOCK_ADDRESS), save it.

Deploy dummy Flipper contract, and pass it's ownership to the Timelock contract

```
npx hardhat --network rsk dev:deploy-flipper --owner TIMELOCK_ADDRESS
```

In the terminal you can see the deployed Flipper contract address (FLIPPER_ADDRESS), save it.

Queue the 2 flips on the Flipper contract:

```
npx hardhat --network rsk dev:flipper-flip-0-1-timelock --timelockaddress TIMELOCK_ADDRESS --flipperaddress FLIPPER_ADDRESS
```

This will output 3 values:

- txHash
  - The queued transaction hash (it can be used later on to determine the 2 remaining values if needed)
- txParamsHash
  - this identifies transaciotions batch by their hashed data
- txParamsData
  - this is the raw bytes that were inputed when queuing the tranasactions batch

Now log in Gnosis safe and start the approval / execution procedure. (`Send` -> `Contract interaction`) and provide:

1. Contract address: TIMELOCK_ADDRESS
2. ABI:

```
[
  {
    "constant": false,
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "txDataHash",
        "type": "bytes32"
      }
    ],
    "name": "approveTransactionsBatch",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "internalType": "bytes",
        "name": "txParamsData",
        "type": "bytes"
      }
    ],
    "name": "approveAndExecuteTransactionsBatchRaw",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
]
```

3. Choose either

   1. `approveAndExecuteTransactionsBatchRaw`

      - This will approve and execute the transaction immediately (you need to provide exactly the same parameters as you provided when queuing). It can be also extracted from the `txHash`
      - Provide `txParamsData`

   2. `approveTransactionsBatch`

      - This will only approve the transaction batch. You will have to execute it (as `timelock proposer` manually from terminal), using: `task("execute-timelock-transaction")`.

Remember it's a Timelock contract and it has time constraints. You **can approve**, but you **cannot execute** a transaction before ETA. After ETA you only have the grace priod (configured in Timelock contract) to execute the transaction.
