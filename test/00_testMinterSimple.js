const { expect } = require("chai")
const { ethers, deployments, getUnnamedAccounts } = require("hardhat")
const { buildMerkleTree, buildProof } = require("../utils/merkle")
const whitelist = require("../whitelists/testWhitelist.json")

describe("MinterSimple", function () {
    let minter
    let deployer
    let nft

    const testFixture = deployments.createFixture(async ({ deployments, getNamedAccounts, ethers }) => {
        const { deployer } = await getNamedAccounts()
        await deployments.fixture("ONFT")
        const nft = await deployments.get("ONFT")
        const minter = await deployments.deploy("ERC721MinterSimple", {
            from: deployer,
            args: [nft.address, ethers.utils.parseUnits("1", 15), 3],
        })

        const nftInstance = await ethers.getContractAt(nft.abi, nft.address, deployer)
        const role = await nftInstance.MINTER_ROLE()
        await nftInstance.grantRole(role, minter.address)
        const addrs = whitelist.whitelist
        let i = 0
        const minterInstance = await ethers.getContractAt(minter.abi, minter.address, deployer)
        while (i < addrs.length) {
            let n = addrs.length - i < 50 ? addrs.length : i + 50
            const tx = await minterInstance.addToWhitelist(addrs.slice(i, n))
            const res = await ethers.provider.waitForTransaction(tx.hash)
            i = n + 1
        }

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
    })

    it("should succesfuly mint from whitelisted address", async () => {
        const account = (await ethers.getSigners())[3]

        const mint = await minter.connect(account).mint(1, { value: ethers.utils.parseUnits("1", 15) })
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

        const mint = await minter.connect(account).mint(3, { value: ethers.utils.parseUnits("3", 15) })
        const receipt = await ethers.provider.waitForTransaction(mint.hash)
        expect(receipt.logs.length).to.be.greaterThan(2, "minting multiple failed")
        const interface = new ethers.utils.Interface(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"])
        const data = receipt.logs[0].data
        const topics = receipt.logs[0].topics
        const event = interface.decodeEventLog("Transfer", data, topics)
        expect(event.from).to.be.equal(ethers.constants.AddressZero)
        expect(event.to).to.be.equal(account.address)
    })
    //accounts 0, 1, 2 should not be whitelisted
    it("should fail to mint from non whitelisted address", async () => {
        const account = (await ethers.getSigners())[1]
        const mint = minter.connect(account).mint(1, { value: ethers.utils.parseUnits("1", 15) })
        await expect(mint).to.be.revertedWith("Address not whitelisted.")
    })

    //accounts 0, 1, 2 should not be whitelisted
    it("should fail to mint multiple with insufficient funds", async () => {
        const account = (await ethers.getSigners())[3]
        const mint = minter.connect(account).mint(3, { value: ethers.utils.parseUnits("2.9999", 15) })
        await expect(mint).to.be.reverted
    })
    it("should fail to mint with insufficient funds", async () => {
        const account = (await ethers.getSigners())[3]
        const mint = minter.connect(account).mint(1, { value: ethers.utils.parseUnits("0.999", 15) })
        await expect(mint).to.be.reverted //With("Insufficient funds provided.")
    })
    it("should fail to mint more than maxQuantity", async () => {
        const account = (await ethers.getSigners())[6]
        const mint = await minter.connect(account).mint(3, { value: ethers.utils.parseUnits("0.11", "ether") })
        const receipt = await ethers.provider.waitForTransaction(mint.hash)
        expect(receipt.logs.length).to.be.greaterThan(0)
        const interface = new ethers.utils.Interface(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"])
        const data = receipt.logs[0].data
        const topics = receipt.logs[0].topics
        const event = interface.decodeEventLog("Transfer", data, topics)
        expect(event.from).to.be.equal(ethers.constants.AddressZero)
        expect(event.to).to.be.equal(account.address)
        const mint2 = minter.connect(account).mint(1, { value: ethers.utils.parseUnits("0.11", "ether") })
        await expect(mint2).to.be.revertedWith("Already claimed.")
    })

    it("should succesfuly withdraw correct proportions to devAddress", async () => {
        const account = (await ethers.getSigners())[3]

        //mint 3 but send 100 eth as payment
        const mint = await minter.connect(account).mint(3, { value: ethers.utils.parseUnits("100", 18) })
        const receipt = await ethers.provider.waitForTransaction(mint.hash)
        expect(receipt.logs.length).to.be.greaterThan(2, "minting multiple failed")

        //call withdrawal
        const withdrawAccount = ethers.Wallet.createRandom()
        await minter.withdraw(withdrawAccount.address)
        const devBal = await ethers.provider.getBalance("0xc891a8B00b0Ea012eD2B56767896CCf83C4A61DD")
        const wBal = await ethers.provider.getBalance(withdrawAccount.address)
        expect(devBal).to.be.equal(ethers.utils.parseEther("2.5", 18), "withdrawal failed")
        expect(wBal).to.be.equal(ethers.utils.parseEther("97.5", 18), "withdrawal failed")
    })

    it("withdraw() should revert if not owner", async () => {
        const account = (await ethers.getSigners())[3]
        //mint 3 but send 100 eth as payment
        const mint = await minter.connect(account).mint(3, { value: ethers.utils.parseUnits("100", 18) })
        const receipt = await ethers.provider.waitForTransaction(mint.hash)
        expect(receipt.logs.length).to.be.greaterThan(2, "minting multiple failed")

        //call withdrawal
        const withdrawAccount = ethers.Wallet.createRandom()
        await expect(minter.connect(account).withdraw(withdrawAccount.address)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("test addToWhitelist() should revert without admin role", async () => {
        const nonAdmin = (await ethers.getSigners())[9]
        await expect(minter.connect(nonAdmin).addToWhitelist([nonAdmin.address])).to.be.revertedWith("Ownable: caller is not the owner")
    })
})
