const LZ_ADDRESS = require("../constants/lzEndpoints.json")
const whitelistRinkeby = require("../whitelists/rinkebyWhitelist.json")
const whitelistMain = require("../whitelists/testWhitelist.json")
const { buildMerkleTree } = require("../utils/merkle")

module.exports = async function ({ deployments, getNamedAccounts, ethers }) {
    const { deploy, read, execute } = deployments
    const { deployer } = await getNamedAccounts()
    console.log(`>>> your address: ${deployer}`)

    const onft = await deployments.get("ONFT")
    const wl = hre.network.name == "mainnet" ? whitelistMain.whitelist : whitelistRinkeby.whitelist
    const tree = buildMerkleTree(whitelist.whitelist)
    const root = tree.getRoot()

    const minter = await deploy("ERC721Minter", {
        from: deployer,
        args: [onft.address, root, ethers.utils.parseUnits("1", "15"), 3],
        log: true,
        waitConfirmations: 1,
    })
    const role = await read("ONFT", { log: true }, "MINTER_ROLE")

    await execute("ONFT", { from: deployer, log: true }, "grantRole", role, minter.address)
}

module.exports.tags = ["ERC721Minter"]
module.exports.dependencies = ["ONFT"]
