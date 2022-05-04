// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

abstract contract IERC721 {
    function mint(address to) external virtual;

    function totalSupply() public view virtual returns (uint);
}

contract ERC721Minter is Ownable {
    IERC721 public erc721;

    //used to verify whitelist user
    bytes32 public merkleRoot;
    uint public mintQuantity;
    uint public price;
    address public devPayoutAddress;
    mapping(address => uint) public claimed;
    mapping(address => bool) public whitelisted;

    constructor(IERC721 erc721_, bytes32 merkleRoot_, uint price_, uint mintQuantity_) {
        erc721 = erc721_;
        mintQuantity = mintQuantity_;
        price = price_;
        merkleRoot = merkleRoot_;
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

    function setRoot(bytes32 newRoot_) public onlyOwner {
        merkleRoot = newRoot_;
    }

    function mint(bytes32[] calldata merkleProof_, uint quantity_) public payable {
        //require payment
        require(msg.value >= price * quantity_, "Insufficient funds provided.");

        //check mint quantity
        require(claimed[msg.sender] + quantity_ <= mintQuantity, "Already claimed.");

        //requires that user is in whitelsit
        require(MerkleProof.verify(merkleProof_, merkleRoot, keccak256(abi.encodePacked(msg.sender))), "Address not whitelisted.");

        //increase quantity that user has claimed
        claimed[msg.sender] = claimed[msg.sender] + quantity_;

        //mint quantity times
        for (uint i = 0; i < quantity_; i++) {
            erc721.mint(msg.sender);
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
