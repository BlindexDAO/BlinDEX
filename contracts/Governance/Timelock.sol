// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Timelock is Ownable {
    enum TrnasactionStatus {
        NonExistent,
        Queued,
        Approved
    }

    struct Transaction {
        address target;
        uint256 value;
        string signature;
        bytes data;
    }

    uint256 public constant GRACE_PERIOD = 14 days;
    uint256 public constant MINIMUM_DELAY = 2 days;
    uint256 public constant MAXIMUM_DELAY = 30 days;

    mapping(bytes32 => TrnasactionStatus) public queuedTransactions;

    address public admin;
    uint256 public delay;

    event QueuedTransactionsBatch(bytes32 indexed txDataHash, uint256 numberOfTransactions, uint256 eta);
    event CancelledTransactionsBatch(bytes32 indexed txDataHash);
    event ApprovedTransactionsBatch(bytes32 indexed txDataHash);
    event ExecutedTransaction(bytes32 indexed txDataHash, address indexed target, uint256 value, string signature, bytes data, uint256 eta);
    event NewAdminSet(address indexed newAdmin);
    event NewDelaySet(uint256 indexed delay);

    constructor(address _admin, uint256 _delay) {
        require(_admin != address(0), "Admin address cannot be 0");
        setDelay(_delay);

        admin = _admin;
    }

    function setAdmin(address _admin) external onlyOwner {
        require(_admin != address(0), "Admin address cannot be 0");

        admin = _admin;

        emit NewAdminSet(admin);
    }

    function setDelay(uint256 _delay) public onlyOwner {
        require(_delay >= MINIMUM_DELAY, "Timelock: Delay must exceed minimum delay.");
        require(_delay <= MAXIMUM_DELAY, "Timelock: Delay must not exceed maximum delay.");

        delay = _delay;

        emit NewDelaySet(delay);
    }

    function queueTransactionsBatch(Transaction[] memory transactions, uint256 eta) external onlyAdmin returns (bytes32) {
        require(msg.sender == admin, "Timelock: Call must come from admin.");

        //todo ag hmm... do we really want it this way?
        require(eta >= block.timestamp + delay, "Timelock: Estimated execution time must satisfy delay."); //todo ag add test!
        require(eta < block.timestamp + delay + GRACE_PERIOD, "Timelock: Estimated execution time must satisfy delay and grace period."); //todo ag add test!

        bytes32 txDataHash = keccak256(abi.encode(transactions, eta));
        queuedTransactions[txDataHash] = TrnasactionStatus.Queued;

        emit QueuedTransactionsBatch(txDataHash, transactions.length, eta);
        return txDataHash;
    }

    function cancelTransactionsBatch(bytes32 txDataHash) external onlyAdmin {
        require(queuedTransactions[txDataHash] != TrnasactionStatus.NonExistent, "Timelock: transaction is not queued"); //todo ag add test!

        delete queuedTransactions[txDataHash];

        emit CancelledTransactionsBatch(txDataHash);
    }

    function approveTransactionsBatch(bytes32 txDataHash) external onlyOwner {
        require(queuedTransactions[txDataHash] == TrnasactionStatus.Queued, "Timelock: transaction is not queued");

        queuedTransactions[txDataHash] = TrnasactionStatus.Approved;

        emit ApprovedTransactionsBatch(txDataHash);
    }

    function executeTransactionsBatch(Transaction[] memory transactions, uint256 eta) external payable onlyAdmin returns (bool) {
        bytes32 txDataHash = keccak256(abi.encode(transactions, eta));
        require(queuedTransactions[txDataHash] == TrnasactionStatus.Approved, "Timelock: Transaction hasn't been approved.");
        require(block.timestamp >= eta, "Timelock: Transaction hasn't surpassed time lock.");
        require(block.timestamp <= eta + GRACE_PERIOD, "Timelock: Transaction is stale.");

        delete queuedTransactions[txDataHash];

        for (uint256 i = 0; i < transactions.length; i++) {
            bytes memory callData = bytes(transactions[i].signature).length == 0
                ? transactions[i].data
                : abi.encodePacked(bytes4(keccak256(bytes(transactions[i].signature))), transactions[i].data);

            // Execute the transaction
            (
                bool success, /* bytes memory returnData */

            ) = transactions[i].target.call{value: transactions[i].value}(callData);
            require(success, "Timelock: Transaction execution reverted.");

            emit ExecutedTransaction(txDataHash, transactions[i].target, transactions[i].value, transactions[i].signature, transactions[i].data, eta);
        }

        return true;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Timelock: only admin can perform this action");
        _;
    }
}
