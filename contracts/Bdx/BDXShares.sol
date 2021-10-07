// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Common/Context.sol";
import "../ERC20/ERC20Custom.sol";
import "../ERC20/IERC20.sol";
import "../Math/SafeMath.sol";
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

    mapping(address => bool) bdstables;

    /* ========== MODIFIERS ========== */

    modifier onlyPools(address bd_stable) {
       require(bdstables[bd_stable] && BDStable(bd_stable).bdstable_pools(msg.sender) == true, "You are not a bd pool");
        _;
    }
    
    modifier onlyByOwner() {
        require(msg.sender == owner_address, "You are not an owner");
        _;
    }

    modifier onlyPoolsOrOwner(address bd_stable) {
       require(bdstables[bd_stable] && BDStable(bd_stable).bdstable_pools(msg.sender) == true || msg.sender == owner_address,
         "You are not an owner nor a bd pool");
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

    function mint(address bd_stable, address to, uint256 amount) public onlyPoolsOrOwner(bd_stable) {
        require(totalSupply().add(amount) <= MAX_TOTAL_SUPPLY, "BDX limit reached");

        _mint(to, amount);

        emit BdxMinted(address(this), to, bd_stable, amount);
    }

    // This function is what other bd pools will call to burn BDX 
    function pool_burn_from(address bd_stable, address b_address, uint256 b_amount) external onlyPools(bd_stable) {

        _burnFrom(b_address, b_amount);
        emit BdxBurned(b_address, address(this), bd_stable, b_amount);
    }

    function howMuchCanBeMinted() external view returns(uint256) {
        return MAX_TOTAL_SUPPLY.sub(totalSupply());
    }

    /* ========== EVENTS ========== */
    
    event OwnerSet(address indexed newOwner);
    event BdxBurned(address indexed from, address indexed to, address bd_stable, uint256 indexed amount);
    event BdxMinted(address indexed from, address indexed to, address bd_stable, uint256 indexed amount);
    event BdStableAddressAdded(address addr);
}
