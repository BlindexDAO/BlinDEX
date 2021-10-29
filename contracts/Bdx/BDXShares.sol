// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/Context.sol";
import "../ERC20/ERC20Custom.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../BdStable/BDStable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

contract BDXShares is ERC20Custom, Initializable {
    using SafeMath for uint256;

    /* ========== STATE VARIABLES ========== */
    uint8 public constant decimals = 18;
    uint256 public constant MAX_TOTAL_SUPPLY = 21*1e6*1e18;

    string public symbol;
    string public name;
    
    address public owner_address;

    mapping(address => bool) private bdstables;

    /* ========== MODIFIERS ========== */
    
    modifier onlyByOwner() {
        require(msg.sender == owner_address, "You are not an owner");
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    function initialize(
        string memory _name,
        string memory _symbol,
        address _owner_address
    )
        external
        initializer
    {
        name = _name;
        symbol = _symbol;
        owner_address = _owner_address;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function addBdStableAddress(address bdstable_contract_address) external onlyByOwner {
        bdstables[bdstable_contract_address] = true;
        emit BdStableAddressAdded(bdstable_contract_address);
    }

    function setOwner(address _owner_address) external onlyByOwner {
        require(_owner_address != address(0), "New owner can't be zero address");
        
        owner_address = _owner_address;
        emit OwnerSet(_owner_address);
    }

    function mint(address bd_stable, address to, uint256 amount) public onlyByOwner {
        require(totalSupply().add(amount) <= MAX_TOTAL_SUPPLY, "BDX limit reached");

        _mint(to, amount);

        emit BdxMinted(address(this), to, bd_stable, amount);
    }

    /* ========== EVENTS ========== */
    
    event OwnerSet(address indexed newOwner);
    event BdxBurned(address indexed from, address indexed to, address bd_stable, uint256 indexed amount);
    event BdxMinted(address indexed from, address indexed to, address bd_stable, uint256 indexed amount);
    event BdStableAddressAdded(address indexed addr);
}
