// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../BdStable/BDStable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract BDXShares is ERC20Upgradeable, OwnableUpgradeable {
    /* ========== STATE VARIABLES ========== */
    uint256 public constant MAX_TOTAL_SUPPLY = 21 * 1e6 * 1e18;

    mapping(address => bool) public mappingBdstables;
    address[] public bdstables;

    /* ========== CONSTRUCTOR ========== */

    function initialize(string memory _name, string memory _symbol) external initializer {
        require(bytes(_name).length > 0, "Name cannot be empty");
        require(bytes(_symbol).length > 0, "Symbol cannot be empty");

        __ERC20_init(_name, _symbol);
        __Ownable_init();
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function getBdStablesLength() external view returns (uint256) {
        return bdstables.length;
    }

    function addBdStableAddress(address bdstable_contract_address) external onlyOwner {
        if (!mappingBdstables[bdstable_contract_address]) {
            mappingBdstables[bdstable_contract_address] = true;
            bdstables.push(bdstable_contract_address);
            emit BdStableAddressAdded(bdstable_contract_address);
        }
    }

    function mint(address to, uint256 amount) public onlyOwner {
        require((totalSupply() + amount) <= MAX_TOTAL_SUPPLY, "BDX limit reached");

        _mint(to, amount);

        emit BdxMinted(address(this), to, amount);
    }

    /* ========== EVENTS ========== */

    event BdxBurned(address indexed from, address indexed to, uint256 indexed amount);
    event BdxMinted(address indexed from, address indexed to, uint256 indexed amount);
    event BdStableAddressAdded(address indexed addr);
}
