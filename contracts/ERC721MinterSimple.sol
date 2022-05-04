// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract IERC721 {
    function mint(address to) external virtual;
}

contract ERC721MinterSimple is Ownable {
    IERC721 public erc721;

    //used to verify whitelist user
    uint public mintQuantity;
    uint public price;
    address public devPayoutAddress;
    mapping(address => uint) public claimed;
    mapping(address => bool) public whitelisted;

    constructor(IERC721 erc721_, uint price_, uint mintQuantity_) {
        erc721 = erc721_;
        mintQuantity = mintQuantity_;
        price = price_;
        devPayoutAddress = address(0xc891a8B00b0Ea012eD2B56767896CCf83C4A61DD);
    }

    function setNFT(IERC721 erc721_) public onlyOwner {
        erc721 = erc721_;
    }

    function setQuantity(uint newQ_) public onlyOwner {
        mintQuantity = newQ_;
    }

    function setPrice(uint newPrice_) public onlyOwner {
        price = newPrice_;
    }

    function mint(uint quantity_) public payable {
        //require payment
        require(msg.value >= price * quantity_, "Insufficient funds provided.");

        //check mint quantity
        require(claimed[msg.sender] + quantity_ <= mintQuantity, "Already claimed.");

        //requires that user is in whitelsit
        require(whitelisted[msg.sender], "Address not whitelisted.");

        //increase quantity that user has claimed
        claimed[msg.sender] = claimed[msg.sender] + quantity_;

        //mint quantity times
        for (uint i = 0; i < quantity_; i++) {
            erc721.mint(msg.sender);
        }
    }

    function addToWhitelist(address[] memory _whitelist) public onlyOwner {
        for (uint i = 0; i < _whitelist.length; i++) {
            whitelisted[_whitelist[i]] = true;
        }
    }

    function withdraw(address to) public onlyOwner {
        uint devAmount = (address(this).balance * 25) / 1000;
        bool success;
        (success, ) = devPayoutAddress.call{value: devAmount}("");
        require(success, "dev withdraw failed");
        (success, ) = to.call{value: address(this).balance}("");
        require(success, "withdraw failed");
    }
}
