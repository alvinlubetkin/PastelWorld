const LZ_ADDRESS = require("../constants/lzEndpoints.json")
const whitelistRinkeby = require("../whitelists/rinkebyWhitelist.json")
const whitelistMain = require("../whitelists/testWhitelist.json")

module.exports = async function ({ deployments, getNamedAccounts, ethers }) {
    const { deploy, read, execute } = deployments
    const { deployer } = await getNamedAccounts()
    console.log(`>>> your address: ${deployer}`)

    const onft = await deployments.get("ONFT")
    const wl = hre.network.name == "mainnet" ? whitelistMain.whitelist : whitelistRinkeby.whitelist

    const minter = await deploy("ERC721MinterSimple", {
        from: deployer,
        args: [onft.address, ethers.utils.parseUnits("1", "15"), 3],
        log: true,
        waitConfirmations: 1,
    })
    const role = await read("ONFT", { log: true }, "MINTER_ROLE")

    await execute("ONFT", { from: deployer, log: true }, "grantRole", role, minter.address)
}

module.exports.tags = ["ERC721MinterSimple"]
module.exports.dependencies = ["ONFT"]
