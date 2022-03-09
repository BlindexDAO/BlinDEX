// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TransactionRelay is Ownable {
    event CreateTransaction(
        bytes32 indexed txHash,
        address indexed creator,
        address indexed targetContractAddress,
        uint256 value,
        string signature,
        bytes data
    );
    event DeleteTransaction(
        bytes32 indexed txHash,
        address indexed creator,
        address indexed targetContractAddress,
        uint256 value,
        string signature,
        bytes data
    );
    event ExecuteTransaction(
        bytes32 indexed txHash,
        address indexed executioner,
        address creator,
        address indexed targetContractAddress,
        uint256 value,
        string signature,
        bytes data,
        bytes returnData
    );

    mapping(bytes32 => StoredTransaction) public storedTransactions;

    struct StoredTransaction {
        address creator;
        address targetContractAddress;
        uint256 value;
        string signature;
        bytes data;
    }

    function createTransaction(
        address targetContractAddress,
        uint256 value,
        string memory signature,
        bytes memory data
    ) external returns (bytes32 txHash) {
        txHash = keccak256(abi.encode(msg.sender, targetContractAddress, value, signature, data));

        if (storedTransactions[txHash].creator == address(0)) {
            storedTransactions[txHash] = StoredTransaction(msg.sender, targetContractAddress, value, signature, data);
        }

        // emit event even if the transaction had already been created, so FE can read status
        emit CreateTransaction(txHash, msg.sender, targetContractAddress, value, signature, data);
        return txHash;
    }

    function deleteTransaction(bytes32 txHash) external {
        StoredTransaction memory transaction = storedTransactions[txHash];

        require(transaction.creator != address(0), "TransactionRelay::deleteTransaction: Transaction hasn't been created.");
        require(transaction.creator == msg.sender, "TransactionRelay::deleteTransaction: It's not your transaction.");

        delete storedTransactions[txHash];

        emit DeleteTransaction(txHash, msg.sender, transaction.targetContractAddress, transaction.value, transaction.signature, transaction.data);
    }

    // creator address is provided as a safety check, to double check we're sending
    function executeTransaction(bytes32 txHash, address creator) external payable onlyOwner returns (bytes memory) {
        StoredTransaction storage transaction = storedTransactions[txHash];

        require(transaction.creator != address(0), "TransactionRelay::executeTransaction: Transaction hasn't been created.");
        require(transaction.creator == creator, "TransactionRelay::executeTransaction: Invalid creator.");

        (bool success, bytes memory returnData) = transaction.targetContractAddress.call{value: transaction.value}(transaction.data);
        require(success, "TransactionRelay::executeTransaction: Transaction execution reverted.");

        emit ExecuteTransaction(
            txHash,
            msg.sender,
            transaction.creator,
            transaction.targetContractAddress,
            transaction.value,
            transaction.signature,
            transaction.data,
            returnData
        );

        return returnData;
    }
}
