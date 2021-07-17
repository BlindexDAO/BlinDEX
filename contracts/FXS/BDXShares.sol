// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Common/Context.sol";
import "../ERC20/ERC20Custom.sol";
import "../ERC20/IERC20.sol";
import "../Math/SafeMath.sol";
import "../Frax/BDStable.sol";

contract BDXShares is ERC20Custom {
    using SafeMath for uint256;

    /* ========== STATE VARIABLES ========== */

    string public symbol;
    string public name;
    uint8 public constant decimals = 18;
    address public FRAXStablecoinAdd;
    
    address public owner_address;

    uint256 public MAX_TOTAL_SUPPLY = 21*1e6*1e18;

    mapping(address => bool) bdstables;


    /* ========== MODIFIERS ========== */

    modifier onlyPools(address bd_stable) {
       require(bdstables[bd_stable] && BDStable(bd_stable).bdstable_pools(msg.sender) == true, "Only bd pools can redeem new BD stable");
        _;
    }
    
    modifier onlyByOwner() {
        require(msg.sender == owner_address, "You are not an owner");
        _;
    }

    modifier onlyPoolsOrOwner(address bd_stable) {
       require(bdstables[bd_stable] && BDStable(bd_stable).bdstable_pools(msg.sender) == true || msg.sender == owner_address,
         "Only bd pools or owner can redeem new BD stable");
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    constructor(
        string memory _name,
        string memory _symbol, 
        address _owner_address
    ) public {
        name = _name;
        symbol = _symbol;
        owner_address = _owner_address;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function addBdStableAddress(address bdstable_contract_address) external onlyByOwner {
        bdstables[bdstable_contract_address] = true;
    }

    
    function setOwner(address _owner_address) external onlyByOwner {
        owner_address = _owner_address;
    }

    function howMuchCanBeMinted() external view returns(uint256) {
        return MAX_TOTAL_SUPPLY.sub(totalSupply());
    }

    function mint(address bd_stable, address to, uint256 amount_d18) public onlyPoolsOrOwner(bd_stable) {
        require(totalSupply().add(amount_d18) <= MAX_TOTAL_SUPPLY, "BDX limit reached");

        _mint(to, amount_d18);
    }

    // This function is what other frax pools will call to mint new BDX (similar to the BdStable mint) 
    function pool_mint(address bd_stable, address to, uint256 amount_d18) external onlyPools(bd_stable) {
        require(totalSupply().add(amount_d18) <= MAX_TOTAL_SUPPLY, "BDX limit reached");

        super._mint(to, amount_d18);
        // emit FXSMinted(address(this), to, amount_d18); //todo ag
    }

    // This function is what other frax pools will call to burn BDX 
    function burn_from(address bd_stable, address b_address, uint256 b_amount) external onlyPools(bd_stable) {
        super._burnFrom(b_address, b_amount);
    }

    // This function is what other frax pools will call to burn BDX 
    function pool_burn_from(address bd_stable, address b_address, uint256 b_amount) external onlyPools(bd_stable) {

        super._burnFrom(b_address, b_amount);
        // emit FXSBurned(b_address, address(this), b_amount); //todo ag
    }

    /* ========== OVERRIDDEN PUBLIC FUNCTIONS ========== */

    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {

        _transfer(sender, recipient, amount);
        // Lukasz: Do we need lowering approvals? - 
        _approve(sender, _msgSender(), _allowances[sender][_msgSender()].sub(amount, "ERC20: transfer amount exceeds allowance"));

        return true;
    }

    /* ========== PUBLIC FUNCTIONS ========== */


    /* ========== INTERNAL FUNCTIONS ========== */


    /* ========== EVENTS ========== */
    
}
