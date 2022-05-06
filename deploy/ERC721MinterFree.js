module.exports = async function ({ deployments, getNamedAccounts, ethers }) {
    const { deploy, read, execute } = deployments
    const { deployer } = await getNamedAccounts()
    console.log(`>>> your address: ${deployer}`)

    const onft = await deployments.get("ONFT")

    const minter = await deploy("ERC721MinterFree", {
        from: deployer,
        args: [onft.address],
        log: true,
        waitConfirmations: 1,
    })
    const role = await read("ONFT", { log: true }, "MINTER_ROLE")

    await execute("ONFT", { from: deployer, log: true }, "grantRole", role, minter.address)
}

module.exports.tags = ["ERC721MinterFree"]
module.exports.dependencies = ["ONFT"]
