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

    address public proposer;
    uint256 public delay;

    event QueuedTransactionsBatch(bytes32 indexed txParamsHash, uint256 numberOfTransactions, uint256 eta);
    event CancelledTransactionsBatch(bytes32 indexed txParamsHash);
    event ApprovedTransactionsBatch(bytes32 indexed txParamsHash);
    event ExecutedTransaction(bytes32 indexed txParamsHash, address indexed target, uint256 value, string signature, bytes data, uint256 eta);
    event NewProposerSet(address indexed newProposer);
    event NewDelaySet(uint256 indexed delay);

    constructor(
        address _proposer,
        uint256 _minimumDelay,
        uint256 _maximumDelay,
        uint256 _gracePeriod,
        uint256 _delay
    ) {
        require(_proposer != address(0), "Proposer address cannot be 0");
        require(_minimumDelay <= _maximumDelay, "Minimum delay cannot be larger than maximum delay");

        minimumDelay = _minimumDelay;
        maximumDelay = _maximumDelay;
        gracePeriod = _gracePeriod;

        setDelay(_delay);

        proposer = _proposer;
    }

    function setProposer(address _proposer) external onlyOwner {
        require(_proposer != address(0), "Proposer address cannot be 0");

        proposer = _proposer;

        emit NewProposerSet(proposer);
    }

    function setDelay(uint256 _delay) public onlyOwner {
        require(_delay >= minimumDelay, "Timelock: Delay must exceed minimum delay.");
        require(_delay <= maximumDelay, "Timelock: Delay must not exceed maximum delay.");

        delay = _delay;

        emit NewDelaySet(delay);
    }

    function queueTransactionsBatch(Transaction[] memory transactions, uint256 eta) external onlyProposerOrOwner returns (bytes32) {
        //todo ag hmm... do we really want it this way? we definitely want 0 delay on local deployment
        require(eta >= block.timestamp + delay, "Timelock: Estimated execution time must satisfy delay.");
        require(eta <= block.timestamp + delay + gracePeriod, "Timelock: Estimated execution time must satisfy delay and grace period.");

        bytes32 txParamsHash = keccak256(abi.encode(transactions, eta));
        queuedTransactions[txParamsHash] = TrnasactionStatus.Queued;

        emit QueuedTransactionsBatch(txParamsHash, transactions.length, eta);
        return txParamsHash;
    }

    function cancelTransactionsBatch(bytes32 txParamsHash) external onlyProposerOrOwner {
        require(queuedTransactions[txParamsHash] != TrnasactionStatus.NonExistent, "Timelock: transaction is not queued");

        delete queuedTransactions[txParamsHash];

        emit CancelledTransactionsBatch(txParamsHash);
    }

    function approveTransactionsBatch(bytes32 txParamsHash) external onlyOwner {
        _approveTransactionsBatchInternal(txParamsHash);
    }

    function executeTransactionsBatch(Transaction[] memory transactions, uint256 eta) external payable onlyProposerOrOwner {
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
        require(queuedTransactions[txParamsHash] == TrnasactionStatus.Queued, "Timelock: transaction is not queued");

        queuedTransactions[txParamsHash] = TrnasactionStatus.Approved;

        emit ApprovedTransactionsBatch(txParamsHash);
    }

    function _executeTransactionsBatchInternal(Transaction[] memory transactions, uint256 eta) internal {
        bytes32 txParamsHash = keccak256(abi.encode(transactions, eta));

        require(queuedTransactions[txParamsHash] == TrnasactionStatus.Approved, "Timelock: Transaction hasn't been approved.");
        require(block.timestamp >= eta, "Timelock: Transaction hasn't surpassed time lock.");
        require(block.timestamp <= eta + gracePeriod, "Timelock: Transaction is stale.");

        delete queuedTransactions[txParamsHash];

        for (uint256 i = 0; i < transactions.length; i++) {
            bytes memory callData = bytes(transactions[i].signature).length == 0
                ? transactions[i].data
                : abi.encodePacked(bytes4(keccak256(bytes(transactions[i].signature))), transactions[i].data);

            // Execute the transaction
            (
                bool success, /* bytes memory returnData */

            ) = transactions[i].target.call{value: transactions[i].value}(callData);
            require(success, "Timelock: Transaction execution reverted.");

            emit ExecutedTransaction(
                txParamsHash,
                transactions[i].target,
                transactions[i].value,
                transactions[i].signature,
                transactions[i].data,
                eta
            );
        }
    }

    modifier onlyProposerOrOwner() {
        require(msg.sender == proposer || msg.sender == owner(), "Timelock: only proposer or owner can perform this action");
        _;
    }
}
