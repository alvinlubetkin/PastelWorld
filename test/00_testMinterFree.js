const { expect } = require("chai")
const { ethers, deployments, getUnnamedAccounts } = require("hardhat")
const { buildMerkleTree, buildProof } = require("../utils/merkle")
const whitelist = require("../whitelists/testWhitelist.json")

describe("MinterFree", function () {
    let minter
    let deployer
    let nft

    const testFixture = deployments.createFixture(async ({ deployments, getNamedAccounts, ethers }) => {
        const { deployer } = await getNamedAccounts()
        await deployments.fixture("ONFT")
        const nft = await deployments.get("ONFT")
        const minter = await deployments.deploy("ERC721MinterFree", {
            from: deployer,
            args: [nft.address],
        })

        const nftInstance = await ethers.getContractAt(nft.abi, nft.address, deployer)
        const role = await nftInstance.MINTER_ROLE()
        await nftInstance.grantRole(role, minter.address)

        return {
            deployerAccount: deployer,
            minterJSON: minter,
            nftJSON: nft,
        }
    })

    beforeEach("reset global vals", async () => {
        const { minterJSON, nftJSON, deployerAccount } = await testFixture()
        minter = await ethers.getContractAt(minterJSON.abi, minterJSON.address, deployer)
        nft = await ethers.getContractAt(nftJSON.abi, nftJSON.address, deployer)
        deployer = deployerAccount

        const signers = await ethers.getSigners()
        const setWl1 = await minter.addToWhitelist([signers[1].address, signers[2].address, signers[3].address])

        const setQ1 = await minter.setQuantity(signers[1].address, 10)
        const setQ2 = await minter.setQuantity(signers[2].address, 5)
        const setQ3 = await minter.setQuantity(signers[3].address, 50)
    })

    it("should succesfuly mint from whitelisted address", async () => {
        const account = (await ethers.getSigners())[3]

        const mint = await minter.connect(account).mint(1)
        const receipt = await ethers.provider.waitForTransaction(mint.hash)
        expect(receipt.logs.length).to.be.greaterThan(0, "tx reverted")
        const interface = new ethers.utils.Interface(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"])
        const data = receipt.logs[0].data
        const topics = receipt.logs[0].topics
        const event = interface.decodeEventLog("Transfer", data, topics)
        expect(event.from).to.be.equal(ethers.constants.AddressZero)
        expect(event.to).to.be.equal(account.address)
    })

    it("should succesfuly mint multiple from whitelisted address", async () => {
        const account = (await ethers.getSigners())[3]

        const mint = await minter.connect(account).mint(50)
        const receipt = await ethers.provider.waitForTransaction(mint.hash)
        expect(receipt.logs.length).to.be.greaterThan(49, "minting multiple failed")
        const interface = new ethers.utils.Interface(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"])
        const data = receipt.logs[0].data
        const topics = receipt.logs[0].topics
        const event = interface.decodeEventLog("Transfer", data, topics)
        expect(event.from).to.be.equal(ethers.constants.AddressZero)
        expect(event.to).to.be.equal(account.address)
    })
    it("should succesfuly mint multiple from whitelisted address", async () => {
        const account = (await ethers.getSigners())[1]

        const mint = await minter.connect(account).mint(10)
        const receipt = await ethers.provider.waitForTransaction(mint.hash)
        expect(receipt.logs.length).to.be.greaterThan(9, "minting multiple failed")
        const interface = new ethers.utils.Interface(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"])
        const data = receipt.logs[0].data
        const topics = receipt.logs[0].topics
        const event = interface.decodeEventLog("Transfer", data, topics)
        expect(event.from).to.be.equal(ethers.constants.AddressZero)
        expect(event.to).to.be.equal(account.address)
    })
    //accounts 0, 1, 2 should not be whitelisted
    it("should fail to mint from non whitelisted address", async () => {
        const account = (await ethers.getSigners())[4]
        const mint = minter.connect(account).mint(1)
        await expect(mint).to.be.revertedWith("Address not whitelisted.")
    })

    it("should fail to mint more than maxQuantity", async () => {
        const account = (await ethers.getSigners())[2]
        const mint = minter.connect(account).mint(6)
        await expect(mint).to.be.revertedWith("Already claimed.")
    })

    it("test addToWhitelist() should revert without admin role", async () => {
        const nonAdmin = (await ethers.getSigners())[9]
        await expect(minter.connect(nonAdmin).addToWhitelist([nonAdmin.address])).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("test setQuantity() should revert without admin role", async () => {
        const nonAdmin = (await ethers.getSigners())[9]
        await expect(minter.connect(nonAdmin).setQuantity(nonAdmin.address, 100)).to.be.revertedWith("Ownable: caller is not the owner")
    })
})
