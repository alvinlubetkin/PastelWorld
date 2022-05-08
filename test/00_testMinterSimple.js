const { expect } = require("chai")
const { ethers, deployments, getUnnamedAccounts } = require("hardhat")
const { buildMerkleTree, buildProof } = require("../utils/merkle")
const whitelist = require("../whitelists/testWhitelist.json")
const ERC721 = require("@openzeppelin/contracts/build/contracts/ERC721PresetMinterPauserAutoId.json")

describe("MinterSimple", function () {
    let minter
    let deployer
    let nft
    let krewPass

    const testFixture = deployments.createFixture(async ({ deployments, getNamedAccounts, ethers }) => {
        const { deployer } = await getNamedAccounts()
        await deployments.fixture("ONFT")
        const nft = await deployments.get("ONFT")

        const KrewPass = await ethers.getContractFactory(ERC721.abi, ERC721.bytecode)
        const krewPass = await KrewPass.deploy("Krew Pass", "KP", "https://")
        await krewPass.deployed()
        const minter = await deployments.deploy("ERC721MinterSimple", {
            from: deployer,
            args: [nft.address, krewPass.address, ethers.utils.parseUnits("1", 15), 3],
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
            pass: krewPass,
        }
    })

    beforeEach("reset global vals", async () => {
        const { minterJSON, nftJSON, deployerAccount, pass } = await testFixture()
        minter = await ethers.getContractAt(minterJSON.abi, minterJSON.address, deployer)
        nft = await ethers.getContractAt(nftJSON.abi, nftJSON.address, deployer)
        krewPass = pass
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

    it("test mintKrewPass() should mint 1 per pass", async () => {
        const [owner, holder1, holder2, nonHolder] = await ethers.getSigners()
        //mint to holders
        await krewPass.connect(owner).mint(holder1.address)
        await krewPass.connect(owner).mint(holder2.address)

        let mint = await minter.connect(holder1).mintKrewPass(0, { value: ethers.utils.parseUnits("1", 15) })
        let receipt = await ethers.provider.waitForTransaction(mint.hash)
        expect(receipt.logs.length).to.be.equal(1, "minting failed")
        mint = await minter.connect(holder2).mintKrewPass(1, { value: ethers.utils.parseUnits("1", 15) })
        receipt = await ethers.provider.waitForTransaction(mint.hash)
        expect(receipt.logs.length).to.be.equal(1, "minting failed")
    })

    it("test mintKrewPass() should revert with insufficient funds", async () => {
        const [owner, holder1, holder2, nonHolder] = await ethers.getSigners()
        //mint to holders
        await krewPass.connect(owner).mint(holder1.address)
        await krewPass.connect(owner).mint(holder2.address)

        await expect(minter.connect(holder1).mintKrewPass(0, { value: ethers.utils.parseUnits("0.99", 15) })).to.be.reverted
        await expect(minter.connect(holder2).mintKrewPass(1, { value: ethers.utils.parseUnits("0.99", 15) })).to.be.reverted
    })

    it("test mintKrewPass() should revert if not holding krew pass", async () => {
        const [owner, holder1, holder2, nonHolder] = await ethers.getSigners()
        //mint to holders
        await krewPass.connect(owner).mint(holder1.address)
        await krewPass.connect(owner).mint(holder2.address)

        await expect(minter.connect(nonHolder).mintKrewPass(0, { value: ethers.utils.parseUnits("1", 15) })).to.be.revertedWith(
            "Address not whitelisted."
        )
        await expect(minter.connect(holder1).mintKrewPass(1, { value: ethers.utils.parseUnits("1", 15) })).to.be.revertedWith(
            "Address not whitelisted."
        )
    })

    it("test publicMintStart() should default to false", async () => {
        expect(await minter.publicMintStart()).to.be.equal(false)
    })

    it("test setPublicMintStart() should be succesful", async () => {
        const [owner] = await ethers.getSigners()
        expect(await minter.connect(owner).publicMintStart()).to.be.equal(false)
        await minter.connect(owner).setPublicMintStart(true)
        expect(await minter.connect(owner).publicMintStart()).to.be.equal(true)
    })

    it("test setPublicMintStart() should revert without ownership", async () => {
        const [owner, nonOwner] = await ethers.getSigners()
        await expect(minter.connect(nonOwner).setPublicMintStart(true)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("test mintPublic() should be succesful", async () => {
        const [owner, holder1, holder2, nonHolder] = await ethers.getSigners()
        //mint to holders
        await minter.connect(owner).setPublicMintStart(true)

        const tx = await minter.connect(nonHolder).mintPublic(2, { value: ethers.utils.parseUnits("2", 15) })
        let receipt = await ethers.provider.waitForTransaction(tx.hash)
        expect(receipt.logs.length).to.be.equal(2, "minting failed")
        const interface = new ethers.utils.Interface(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"])
        const data = receipt.logs[0].data
        const topics = receipt.logs[0].topics
        const event = interface.decodeEventLog("Transfer", data, topics)
        expect(event.from).to.be.equal(ethers.constants.AddressZero)
        expect(event.to).to.be.equal(nonHolder.address)
    })

    it("test mintPublic() should revert if not active", async () => {
        const [owner, nonHolder] = await ethers.getSigners()
        //mint to holders
        await minter.connect(owner).setPublicMintStart(false)

        await expect(minter.connect(nonHolder).mintPublic(2, { value: ethers.utils.parseUnits("2", 15) })).to.be.revertedWith(
            "Public mint has not started."
        )
    })

    it("test mintPublic() should revert if already claimed", async () => {
        const [owner, nonHolder] = await ethers.getSigners()
        //mint to holders
        await minter.connect(owner).setPublicMintStart(true)

        const tx = await minter.connect(nonHolder).mintPublic(2, { value: ethers.utils.parseUnits("2", 15) })
        let receipt = await ethers.provider.waitForTransaction(tx.hash)
        expect(receipt.logs.length).to.be.equal(2, "minting failed")

        await expect(minter.connect(nonHolder).mintPublic(2, { value: ethers.utils.parseUnits("2", 15) })).to.be.revertedWith("Already claimed.")
    })
    it("test mintPublic() should revert with insufficient funds ", async () => {
        const [owner, nonHolder] = await ethers.getSigners()
        //mint to holders
        await minter.connect(owner).setPublicMintStart(true)

        await expect(minter.connect(nonHolder).mintPublic(2, { value: ethers.utils.parseUnits("0.9", 15) })).to.be.reverted
    })
})
