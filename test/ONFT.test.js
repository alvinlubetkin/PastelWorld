const { expect } = require("chai")
const { ethers } = require("hardhat")
const DEPLOY_ARGS = require("../constants/onftTokenRanges.json")

describe("ONFT", function () {
    let accounts, owner, chainIdFuji, chainIdMumbai, lzEndpointMock_fuji, lzEndpointMock_mumbai, onft_Fuji, onft_Mumbai, mockUsdc

    beforeEach(async function () {
        accounts = await ethers.getSigners()
        owner = accounts[0]

        const LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
        const ONFT = await ethers.getContractFactory("ONFT")
        const MockToken = await ethers.getContractFactory("MockToken")

        chainIdFuji = DEPLOY_ARGS.fuji.chainId
        chainIdMumbai = DEPLOY_ARGS.mumbai.chainId

        lzEndpointMock_fuji = await LZEndpointMock.deploy(chainIdFuji)
        lzEndpointMock_mumbai = await LZEndpointMock.deploy(chainIdMumbai)

        // create two ONFT instances
        onft_Fuji = await ONFT.deploy(
            DEPLOY_ARGS.name,
            DEPLOY_ARGS.symbol,
            "baseTokenURI",
            lzEndpointMock_fuji.address,
            DEPLOY_ARGS.feeCollectorAddress,
            DEPLOY_ARGS.hardhat.maxSupply
        )

        //max supply is 3 so for testint maxSupply
        onft_Mumbai = await ONFT.deploy(
            DEPLOY_ARGS.name,
            DEPLOY_ARGS.symbol,
            "baseTokenURI",
            lzEndpointMock_mumbai.address,
            DEPLOY_ARGS.feeCollectorAddress,
            3
        )

        await lzEndpointMock_fuji.setDestLzEndpoint(onft_Mumbai.address, lzEndpointMock_mumbai.address)
        await lzEndpointMock_mumbai.setDestLzEndpoint(onft_Fuji.address, lzEndpointMock_fuji.address)

        // set each contracts source address so it can send to each other
        await onft_Fuji.setTrustedRemote(chainIdMumbai, onft_Mumbai.address) // for A, set B
        await onft_Mumbai.setTrustedRemote(chainIdFuji, onft_Fuji.address) // for B, set A

        //grant mint roles
        const minterRoleFuji = await onft_Fuji.MINTER_ROLE()
        const minterRoleMumbai = await onft_Mumbai.MINTER_ROLE()
        await onft_Fuji.grantRole(minterRoleFuji, owner.address)
        await onft_Mumbai.grantRole(minterRoleMumbai, owner.address)
    })

    it("test send() ONFT to the destination chain", async function () {
        const fujiTokenId_1 = 0
        const fujiTokenId_2 = 1
        // const mumbaiTokenId = 0
        const signer = (await ethers.getSigners())[0]

        // verify the owner of the tokenIds do not exist mumbaiTokenIdon the source chain
        await expect(onft_Fuji.ownerOf(fujiTokenId_1)).to.be.revertedWith("ERC721: owner query for nonexistent token")
        await expect(onft_Fuji.ownerOf(fujiTokenId_2)).to.be.revertedWith("ERC721: owner query for nonexistent token")
        await expect(onft_Mumbai.ownerOf(fujiTokenId_1)).to.be.revertedWith("ERC721: owner query for nonexistent token")

        // // activate the mint on the ONFT contracts
        // await onft_Fuji.activateMint()
        // await onft_Mumbai.activateMint()

        const feeCollectorAddress = await onft_Fuji.feeCollectorAddress()
        // mint 2 tokens
        await onft_Fuji.mint(signer.address)
        await onft_Fuji.mint(signer.address)
        // expect((await onft_Fuji.price()).mul(2).toString()).to.be.equal(currentOwnerBalance)

        // verify the owner of the tokenIds do exist on the source chain
        expect(await onft_Fuji.ownerOf(fujiTokenId_1)).to.be.equal(signer.address)
        expect(await onft_Fuji.ownerOf(fujiTokenId_2)).to.be.equal(signer.address)

        // v1 adapterParams, encoded for version 1 style, and 200k gas quote
        const adapterParam = ethers.utils.solidityPack(["uint16", "uint256"], [1, 225000])

        await onft_Fuji.pauseSendTokens(true)
        await expect(
            onft_Fuji.send(
                chainIdMumbai,
                ethers.utils.solidityPack(["address"], [owner.address]),
                fujiTokenId_1,
                owner.address,
                "0x000000000000000000000000000000000000dEaD",
                adapterParam
            )
        ).to.revertedWith("Pausable: paused")

        await onft_Fuji.pauseSendTokens(false)

        await onft_Fuji.send(
            chainIdMumbai,
            ethers.utils.solidityPack(["address"], [owner.address]),
            fujiTokenId_1,
            owner.address,
            "0x000000000000000000000000000000000000dEaD",
            adapterParam
        )

        // verify the owner of the token is no longer on the source chain
        await expect(onft_Fuji.ownerOf(fujiTokenId_1)).to.revertedWith("ERC721: owner query for nonexistent token")

        // verify the owner of the token is on the destination chain
        currentOwner = await onft_Mumbai.ownerOf(fujiTokenId_1)

        expect(currentOwner).to.be.equal(owner.address)
    })

    it("test reveal() should default to false", async function () {
        const fujiTokenId_1 = 37
        // await onft_Fuji.activateMint()
        const signer = (await ethers.getSigners())[0]
        expect(await onft_Fuji.reveal()).to.be.false
        await onft_Fuji.mint(signer.address)
        expect(await onft_Fuji.tokenURI(fujiTokenId_1)).to.equal("baseTokenURI")
    })

    it("test setContractURI() should revert without admint role", async function () {
        const nonAdmin = (await ethers.getSigners())[9]
        await expect(onft_Fuji.connect(nonAdmin).setContractURI("setContractURI")).to.be.revertedWith("Must have admin role.")
    })

    it("test setContractURI() and get contractURI()", async function () {
        expect(await onft_Fuji.contractURI()).to.be.equal("baseTokenURI")
        await onft_Fuji.setContractURI("setContractURI")
        expect(await onft_Fuji.contractURI()).to.be.equal("setContractURI")
    })

    it("test setFeeCollector() should revert without admint role", async function () {
        const nonAdmin = (await ethers.getSigners())[9]
        await expect(onft_Fuji.connect(nonAdmin).setFeeCollector(nonAdmin.address)).to.be.revertedWith("Must have admin role.")
    })

    it("test setFeeCollector() and getFeeCollector()", async function () {
        expect(await onft_Fuji.feeCollectorAddress()).to.be.equal("0xE22FD0840d127E44557D5E19A0A9a52EAfc3e297")
        await onft_Fuji.setFeeCollector(ethers.constants.AddressZero)
        expect(await onft_Fuji.feeCollectorAddress()).to.be.equal(ethers.constants.AddressZero)
    })

    it("test activateReveal() and getReveal()", async function () {
        expect(await onft_Fuji.reveal()).to.be.equal(false)

        expect(await onft_Fuji.tokenURI(0)).to.be.equal("baseTokenURI")

        await onft_Fuji.activateReveal()

        expect(await onft_Fuji.reveal()).to.be.equal(true)

        expect(await onft_Fuji.tokenURI(0)).to.be.equal("baseTokenURI0")
    })

    it("test activateReveal() should revert without admin role", async function () {
        const nonAdmin = (await ethers.getSigners())[9]
        await expect(onft_Fuji.connect(nonAdmin).activateReveal()).to.be.revertedWith("Must have admin role.")
    })

    it("test setTrustedRemote() should revert if not admin role", async () => {
        const nonAdmin = (await ethers.getSigners())[9]
        await expect(onft_Fuji.connect(nonAdmin).setTrustedRemote(chainIdMumbai, onft_Mumbai.address)).to.be.revertedWith(
            "Must have admin role."
        ) // for A, set B
    })

    it("test mint() should revert past maxSupply", async function () {
        let currentOwner
        expect(await onft_Mumbai.mint(owner.address)).to.emit(onft_Fuji, "Transfer")
        currentOwner = await onft_Mumbai.ownerOf(0)
        expect(currentOwner).to.be.equal(owner.address)
        expect(await onft_Mumbai.mint(owner.address)).to.emit(onft_Fuji, "Transfer")
        currentOwner = await onft_Mumbai.ownerOf(1)
        expect(currentOwner).to.be.equal(owner.address)
        expect(await onft_Mumbai.mint(owner.address)).to.emit(onft_Fuji, "Transfer")
        currentOwner = await onft_Mumbai.ownerOf(2)
        expect(currentOwner).to.be.equal(owner.address)
        await expect(onft_Mumbai.mint(owner.address)).to.revertedWith("Max supply reached.")
    })

    it("test mint() should revert without minter role", async () => {
        const noRole = (await ethers.getSigners())[9]
        await expect(onft_Mumbai.connect(noRole).mint(owner.address)).to.revertedWith("Must have minter role.")
    })

    it("test chainId() should default to false for all tokenIds", async () => {
        let chainId = await onft_Mumbai.chainId(0)
        expect(chainId).to.be.equal(0)
        chainId = await onft_Mumbai.chainId(8888)
        expect(chainId).to.be.equal(0)
        chainId = await onft_Mumbai.chainId(4443)
        expect(chainId).to.be.equal(0)
    })

    it("test setChainId() should update chainId", async () => {
        const newChainId = 3
        const tokenId = 0
        const initChainId = await onft_Mumbai.chainId(tokenId)
        expect(initChainId).to.be.equal(0)
        await onft_Mumbai.setChainId(tokenId, newChainId)
        const updatedChainId = await onft_Mumbai.chainId(tokenId)
        expect(updatedChainId).to.not.be.equal(initChainId)
        expect(updatedChainId).to.be.equal(newChainId)
    })

    it("test setChainId() should update chainId", async () => {
        const newChainIds = []
        const tokenIds = []
        for (let i = 0; i < 50; i++) {
            tokenIds.push(i)
            newChainIds.push(i % 5)
        }
        await onft_Mumbai.setChainIds(tokenIds, newChainIds)
        for (let i = 0; i < 50; i++) {
            const updatedChainId = await onft_Mumbai.chainId(tokenIds[i])
            expect(updatedChainId).to.be.equal(newChainIds[i])
        }
    })
    it("test setChainId() should revert without admin role", async () => {
        const nonAdmin = (await ethers.getSigners())[9]
        const newChainId = 3
        const tokenId = 0
        await expect(onft_Mumbai.connect(nonAdmin).setChainId(tokenId, newChainId)).to.be.revertedWith("Must have admin role.")
    })

    it("test setChainId() should revert without admin role", async () => {
        const nonAdmin = (await ethers.getSigners())[9]
        const newChainIds = []
        const tokenIds = []
        for (let i = 0; i < 50; i++) {
            tokenIds.push(i)
            newChainIds.push(i % 5)
        }
        await expect(onft_Mumbai.connect(nonAdmin).setChainIds(tokenIds, newChainIds)).to.be.revertedWith("Must have admin role.")
    })
})
