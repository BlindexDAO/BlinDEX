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

    uint256 public minimumDelay;
    uint256 public maximumDelay;
    uint256 public gracePeriod;

    mapping(bytes32 => TrnasactionStatus) public queuedTransactions;

    address public admin;
    uint256 public delay;

    event QueuedTransactionsBatch(bytes32 indexed txDataHash, uint256 numberOfTransactions, uint256 eta);
    event CancelledTransactionsBatch(bytes32 indexed txDataHash);
    event ApprovedTransactionsBatch(bytes32 indexed txDataHash);
    event ExecutedTransaction(bytes32 indexed txDataHash, address indexed target, uint256 value, string signature, bytes data, uint256 eta);
    event NewAdminSet(address indexed newAdmin);
    event NewDelaySet(uint256 indexed delay);

    constructor(
        address _admin,
        uint256 _minimumDelay,
        uint256 _maximumDelay,
        uint256 _gracePeriod,
        uint256 _delay
    ) {
        require(_admin != address(0), "Admin address cannot be 0");
        require(_minimumDelay <= _maximumDelay, "Minimum delay cannot be larger than maximum delay");

        minimumDelay = _minimumDelay;
        maximumDelay = _maximumDelay;
        gracePeriod = _gracePeriod;

        setDelay(_delay);

        admin = _admin;
    }

    function setAdmin(address _admin) external onlyOwner {
        require(_admin != address(0), "Admin address cannot be 0");

        admin = _admin;

        emit NewAdminSet(admin);
    }

    function setDelay(uint256 _delay) public onlyOwner {
        require(_delay >= minimumDelay, "Timelock: Delay must exceed minimum delay.");
        require(_delay <= maximumDelay, "Timelock: Delay must not exceed maximum delay.");

        delay = _delay;

        emit NewDelaySet(delay);
    }

    function queueTransactionsBatch(Transaction[] memory transactions, uint256 eta) external onlyAdminOrOwner returns (bytes32) {
        //todo ag hmm... do we really want it this way? we definitely want 0 delay on local deployment
        require(eta >= block.timestamp + delay, "Timelock: Estimated execution time must satisfy delay.");
        require(eta <= block.timestamp + delay + gracePeriod, "Timelock: Estimated execution time must satisfy delay and grace period.");

        bytes32 txDataHash = keccak256(abi.encode(transactions, eta));
        queuedTransactions[txDataHash] = TrnasactionStatus.Queued;

        emit QueuedTransactionsBatch(txDataHash, transactions.length, eta);
        return txDataHash;
    }

    function cancelTransactionsBatch(bytes32 txDataHash) external onlyAdminOrOwner {
        require(queuedTransactions[txDataHash] != TrnasactionStatus.NonExistent, "Timelock: transaction is not queued");

        delete queuedTransactions[txDataHash];

        emit CancelledTransactionsBatch(txDataHash);
    }

    function approveTransactionsBatch(bytes32 txDataHash) external onlyOwner {
        _approveTransactionsBatchInternal(txDataHash);
    }

    function executeTransactionsBatch(Transaction[] memory transactions, uint256 eta) external payable onlyAdminOrOwner {
        _executeTransactionsBatchInternal(transactions, eta);
    }

    function approveAndExecuteTransactionsBatch(Transaction[] memory transactions, uint256 eta) external payable onlyOwner {
        bytes32 txDataHash = keccak256(abi.encode(transactions, eta));
        _approveTransactionsBatchInternal(txDataHash);

        _executeTransactionsBatchInternal(transactions, eta);
    }

    function _approveTransactionsBatchInternal(bytes32 txDataHash) internal onlyOwner {
        require(queuedTransactions[txDataHash] == TrnasactionStatus.Queued, "Timelock: transaction is not queued");

        queuedTransactions[txDataHash] = TrnasactionStatus.Approved;

        emit ApprovedTransactionsBatch(txDataHash);
    }

    function _executeTransactionsBatchInternal(Transaction[] memory transactions, uint256 eta) internal {
        bytes32 txDataHash = keccak256(abi.encode(transactions, eta));

        require(queuedTransactions[txDataHash] == TrnasactionStatus.Approved, "Timelock: Transaction hasn't been approved.");
        require(block.timestamp >= eta, "Timelock: Transaction hasn't surpassed time lock.");
        require(block.timestamp <= eta + gracePeriod, "Timelock: Transaction is stale.");

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
    }

    modifier onlyAdminOrOwner() {
        require(msg.sender == admin || msg.sender == owner(), "Timelock: only admin or owner can perform this action");
        _;
    }
}
