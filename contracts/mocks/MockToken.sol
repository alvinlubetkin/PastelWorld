// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    uint8 _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
        _mint(msg.sender, 1000000000 * (10**decimals_));
    }

    bool paused;

    function mint(address _to, uint _amount) public {
        _mint(_to, _amount);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function transfer(address recipient, uint amount) public virtual override returns (bool) {
        // need to mock some failed transfer events
        require(!paused, "Failed transfer due to pause");

        return super.transfer(recipient, amount);
    }

    function transferFrom(address sender, address recipient, uint amount) public virtual override returns (bool) {
        // need to mock some failed transfer events
        require(!paused, "Failed transfer due to pause");
        return super.transferFrom(sender, recipient, amount);
    }

    function pauseTransfers(bool _paused) external {
        paused = _paused;
    }
}
