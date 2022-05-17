// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Timelock is Ownable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.AddressSet;

    enum TransactionStatus {
        NonExistent, // 0 is what you get from a non-existent transaction (which you can get e.g. from a mapping)
        Queued,
        Approved
    }

    struct Transaction {
        address recipient;
        uint256 value;
        bytes data;
    }

    struct PendingTransaction {
        bytes32 txParamsHash;
        TransactionStatus status;
    }

    uint256 public minimumExecutionDelay;
    uint256 public maximumExecutionDelay;
    uint256 public executionGracePeriod;

    address public proposer;
    EnumerableSet.AddressSet executors;

    EnumerableSet.Bytes32Set pendingTransactionsParamsHashes;
    mapping(bytes32 => TransactionStatus) public pendingTransactions;

    event QueuedTransactionsBatch(bytes32 indexed txParamsHash, uint256 numberOfTransactions, uint256 eta);
    event CancelledTransactionsBatch(bytes32 indexed txParamsHash);
    event ApprovedTransactionsBatch(bytes32 indexed txParamsHash);
    event ExecutedTransaction(bytes32 indexed txParamsHash, address indexed recipient, uint256 value, bytes data, uint256 eta);
    event NewProposerSet(address indexed previousProposer, address indexed newProposer);
    event NewExecutorAdded(address indexed executor);
    event ExecutorRemoved(address indexed executor);
    event NewExecutionDelaySet(uint256 indexed delay);
    event NewMinimumExecutionDelaySet(uint256 indexed delay);
    event NewMaximumExecutionDelaySet(uint256 indexed delay);
    event NewExecutionGracePeriodSet(uint256 indexed gracePeriod);

    constructor(
        address _proposer,
        address _executor,
        uint256 _minimumExecutionDelay,
        uint256 _maximumExecutionDelay,
        uint256 _executionGracePeriod
    ) {
        require(_minimumExecutionDelay <= _maximumExecutionDelay, "Timelock: The minimum delay cannot be larger than the maximum execution delay");

        setMinimumExecutionDelay(_minimumExecutionDelay);
        setMaximumExecutionDelay(_maximumExecutionDelay);
        setExecutionGracePeriod(_executionGracePeriod);
        setProposer(_proposer);
        addExecutor(_executor);
    }

    function setProposer(address _proposer) public onlyOwner {
        require(_proposer != address(0), "Timelock: Proposer address cannot be 0");
        require(_proposer != proposer, "Timelock: New proposer must be different than the current proposer");

        address previousProposer = proposer;
        proposer = _proposer;

        emit NewProposerSet(previousProposer, proposer);
    }

    function addExecutor(address _executor) public onlyOwner {
        require(!executors.contains(_executor), "Timelock: executor already exists");
        require(_executor != address(0), "Timelock: executor cannot be 0 address");

        executors.add(_executor);
        emit NewExecutorAdded(_executor);
    }

    function removeExecutor(address _executor) public onlyOwner {
        require(executors.contains(_executor), "Timelock: executor doesn't exist");

        executors.remove(_executor);
        emit ExecutorRemoved(_executor);
    }

    function executorsCount() external view returns (uint256) {
        return executors.length();
    }

    function executorAt(uint256 i) external view returns (address) {
        require(executors.length() > i, "Timelock: executors index out of range");
        return executors.at(i);
    }

    function setMinimumExecutionDelay(uint256 _minimumExecutionDelay) public onlyOwner {
        require(_minimumExecutionDelay >= 3600 * 24, "Timelock: Minimum execution delay must be >= 1 day.");

        minimumExecutionDelay = _minimumExecutionDelay;

        emit NewMinimumExecutionDelaySet(minimumExecutionDelay);
    }

    function setMaximumExecutionDelay(uint256 _maximumExecutionDelay) public onlyOwner {
        require(_maximumExecutionDelay >= minimumExecutionDelay, "Timelock: Maximum execution delay cannot be lesser than minimum execution delay.");

        maximumExecutionDelay = _maximumExecutionDelay;

        emit NewMaximumExecutionDelaySet(_maximumExecutionDelay);
    }

    function setExecutionGracePeriod(uint256 _executionGracePeriod) public onlyOwner {
        executionGracePeriod = _executionGracePeriod;

        emit NewExecutionGracePeriodSet(_executionGracePeriod);
    }

    function queueTransactionsBatch(Transaction[] memory transactions, uint256 eta) external onlyProposer returns (bytes32) {
        require(
            eta >= block.timestamp + minimumExecutionDelay && eta <= block.timestamp + maximumExecutionDelay,
            "Timelock: Estimated execution time must satisfy delay."
        );

        require(transactions.length > 0, "Timelock: You need at least 1 transaction to queue a batch");

        bytes32 txParamsHash = keccak256(abi.encode(transactions, eta));
        pendingTransactions[txParamsHash] = TransactionStatus.Queued;
        pendingTransactionsParamsHashes.add(txParamsHash);

        emit QueuedTransactionsBatch(txParamsHash, transactions.length, eta);
        return txParamsHash;
    }

    function cancelTransactionsBatch(bytes32 txParamsHash) external onlyOwner {
        require(pendingTransactions[txParamsHash] != TransactionStatus.NonExistent, "Timelock: transaction is not queued");

        delete pendingTransactions[txParamsHash];
        pendingTransactionsParamsHashes.remove(txParamsHash);

        emit CancelledTransactionsBatch(txParamsHash);
    }

    function approveTransactionsBatch(bytes32 txParamsHash) external onlyOwner {
        _approveTransactionsBatchInternal(txParamsHash);
    }

    function executeTransactionsBatch(Transaction[] memory transactions, uint256 eta) external payable onlyExecutorOrOwner {
        _executeTransactionsBatchInternal(transactions, eta);
    }

    function approveAndExecuteTransactionsBatch(Transaction[] memory transactions, uint256 eta) external payable onlyOwner {
        bytes32 txParamsHash = keccak256(abi.encode(transactions, eta));

        _approveTransactionsBatchInternal(txParamsHash);
        _executeTransactionsBatchInternal(transactions, eta);
    }

    function approveAndExecuteTransactionsBatchRaw(bytes calldata txParamsData) external payable onlyOwner {
        bytes32 txParamsHash = keccak256(txParamsData);
        (Transaction[] memory transactions, uint256 eta) = abi.decode(txParamsData, (Transaction[], uint256));

        _approveTransactionsBatchInternal(txParamsHash);
        _executeTransactionsBatchInternal(transactions, eta);
    }

    function _approveTransactionsBatchInternal(bytes32 txParamsHash) internal onlyOwner {
        require(pendingTransactions[txParamsHash] == TransactionStatus.Queued, "Timelock: transaction is not queued");

        pendingTransactions[txParamsHash] = TransactionStatus.Approved;

        emit ApprovedTransactionsBatch(txParamsHash);
    }

    function _executeTransactionsBatchInternal(Transaction[] memory transactions, uint256 eta) internal nonReentrant {
        bytes32 txParamsHash = keccak256(abi.encode(transactions, eta));

        require(pendingTransactions[txParamsHash] == TransactionStatus.Approved, "Timelock: Transaction hasn't been approved.");
        require(block.timestamp >= eta, "Timelock: Transaction hasn't surpassed the execution delay.");
        require(block.timestamp <= eta + executionGracePeriod, "Timelock: Transaction is stale.");

        delete pendingTransactions[txParamsHash];
        pendingTransactionsParamsHashes.remove(txParamsHash);

        for (uint256 i = 0; i < transactions.length; i++) {
            (
                bool success, /* ignore the rest */

            ) = transactions[i].recipient.call{value: transactions[i].value}(transactions[i].data);
            require(success, "Timelock: Transaction execution reverted.");

            emit ExecutedTransaction(txParamsHash, transactions[i].recipient, transactions[i].value, transactions[i].data, eta);
        }
    }

    function getPendingTransactions() external view returns (PendingTransaction[] memory) {
        PendingTransaction[] memory pending = new PendingTransaction[](pendingTransactionsParamsHashes.length());

        for (uint256 i = 0; i < pendingTransactionsParamsHashes.length(); i++) {
            bytes32 txParamsHash = pendingTransactionsParamsHashes.at(i);
            pending[i] = PendingTransaction(txParamsHash, pendingTransactions[txParamsHash]);
        }

        return pending;
    }

    function getPendingTransactionAt(uint256 i) external view returns (PendingTransaction memory) {
        require(pendingTransactionsParamsHashes.length() > i, "Timelock: pending transactions index out of range");

        bytes32 txParamsHash = pendingTransactionsParamsHashes.at(i);
        return PendingTransaction(txParamsHash, pendingTransactions[txParamsHash]);
    }

    function getPendingTransactionsCount() external view returns (uint256) {
        return pendingTransactionsParamsHashes.length();
    }

    modifier onlyProposer() {
        require(msg.sender == proposer, "Timelock: only the proposer can perform this action");
        _;
    }

    modifier onlyExecutorOrOwner() {
        require(executors.contains(msg.sender) || msg.sender == owner(), "Timelock: only the executor or owner can perform this action");
        _;
    }
}
