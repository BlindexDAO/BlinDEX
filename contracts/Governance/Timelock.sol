// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Timelock is Ownable {
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

    uint256 public minimumExecutionDelay;
    uint256 public maximumExecutionDelay;
    uint256 public executionGracePeriod;

    address public proposer;

    mapping(bytes32 => TransactionStatus) public queuedTransactions;

    event QueuedTransactionsBatch(bytes32 indexed txParamsHash, uint256 numberOfTransactions, uint256 eta);
    event CancelledTransactionsBatch(bytes32 indexed txParamsHash);
    event ApprovedTransactionsBatch(bytes32 indexed txParamsHash);
    event ExecutedTransaction(bytes32 indexed txParamsHash, address indexed recipient, uint256 value, bytes data, uint256 eta);
    event NewProposerSet(address indexed previousProposer, address indexed newProposer);
    event NewExecutionDelaySet(uint256 indexed delay);
    event NewMinimumExecutionDelaySet(uint256 indexed delay);
    event NewMaximumExecutionDelaySet(uint256 indexed delay);
    event NewExecutionGracePeriodSet(uint256 indexed delay);

    constructor(
        address _proposer,
        uint256 _minimumExecutionDelay,
        uint256 _maximumExecutionDelay,
        uint256 _executionGracePeriod
    ) {
        require(_minimumExecutionDelay <= _maximumExecutionDelay, "The minimum delay cannot be larger than the maximum execution delay");

        setMinimumExecutionDelay(_minimumExecutionDelay);
        setMaximumExecutionDelay(_maximumExecutionDelay);
        setExecutionGracePeriod(_executionGracePeriod);
        setProposer(_proposer);
    }

    function setProposer(address _proposer) public onlyOwner {
        require(_proposer != address(0), "Proposer address cannot be 0");

        address previousProposer = proposer;
        proposer = _proposer;

        emit NewProposerSet(previousProposer, proposer);
    }

    function setMinimumExecutionDelay(uint256 _minimumExecutionDelay) public onlyOwner {
        //todo ag tests
        require(_minimumExecutionDelay >= 3600 * 24, "Timelock: Minimum execution delay must be >= 1 day.");

        minimumExecutionDelay = _minimumExecutionDelay;

        emit NewMinimumExecutionDelaySet(minimumExecutionDelay);
    }

    function setMaximumExecutionDelay(uint256 _maximumExecutionDelay) public onlyOwner {
        //todo ag tests
        require(_maximumExecutionDelay >= minimumExecutionDelay, "Timelock: Maximum execution delay cannot be lesser than minimum execution delay.");

        maximumExecutionDelay = _maximumExecutionDelay;

        emit NewMaximumExecutionDelaySet(_maximumExecutionDelay);
    }

    function setExecutionGracePeriod(uint256 _executionGracePeriod) public onlyOwner {
        //todo ag tests
        executionGracePeriod = _executionGracePeriod;

        emit NewExecutionGracePeriodSet(_executionGracePeriod);
    }

    function queueTransactionsBatch(Transaction[] memory transactions, uint256 eta) external onlyProposer returns (bytes32) {
        require(
            eta >= block.timestamp + minimumExecutionDelay && eta <= block.timestamp + maximumExecutionDelay,
            "Timelock: Estimated execution time must satisfy delay."
        );

        bytes32 txParamsHash = keccak256(abi.encode(transactions, eta));
        queuedTransactions[txParamsHash] = TransactionStatus.Queued;

        emit QueuedTransactionsBatch(txParamsHash, transactions.length, eta);
        return txParamsHash;
    }

    function cancelTransactionsBatch(bytes32 txParamsHash) external onlyOwner {
        require(queuedTransactions[txParamsHash] != TransactionStatus.NonExistent, "Timelock: transaction is not queued");

        delete queuedTransactions[txParamsHash];

        emit CancelledTransactionsBatch(txParamsHash);
    }

    function approveTransactionsBatch(bytes32 txParamsHash) external onlyOwner {
        _approveTransactionsBatchInternal(txParamsHash);
    }

    function executeTransactionsBatch(Transaction[] memory transactions, uint256 eta) external payable onlyOwner {
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
        require(queuedTransactions[txParamsHash] == TransactionStatus.Queued, "Timelock: transaction is not queued");

        queuedTransactions[txParamsHash] = TransactionStatus.Approved;

        emit ApprovedTransactionsBatch(txParamsHash);
    }

    function _executeTransactionsBatchInternal(Transaction[] memory transactions, uint256 eta) internal {
        bytes32 txParamsHash = keccak256(abi.encode(transactions, eta));

        require(queuedTransactions[txParamsHash] == TransactionStatus.Approved, "Timelock: Transaction hasn't been approved.");
        require(block.timestamp >= eta, "Timelock: Transaction hasn't surpassed the execution delay.");
        require(block.timestamp <= eta + executionGracePeriod, "Timelock: Transaction is stale.");

        delete queuedTransactions[txParamsHash];

        for (uint256 i = 0; i < transactions.length; i++) {
            (
                bool success, /* ignore the rest */

            ) = transactions[i].recipient.call{value: transactions[i].value}(transactions[i].data);
            require(success, "Timelock: Transaction execution reverted.");

            emit ExecutedTransaction(txParamsHash, transactions[i].recipient, transactions[i].value, transactions[i].data, eta);
        }
    }

    modifier onlyProposer() {
        require(msg.sender == proposer, "Timelock: only the proposer can perform this action");
        _;
    }
}
