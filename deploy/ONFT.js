const ONFT_ARGS = require("../constants/onftTokenRanges.json")

module.exports = async function ({ deployments, getNamedAccounts }) {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()
    // let gasPrice
    // if (hre.network.name == "rinkeby") gasPrice = ethers.utils.parseUnits("10", "gwei")
    const deployLog = () => {
        console.log(`>>> your address: ${deployer}`)
        console.log(`hre.network.name: ${hre.network.name}`)
        console.log(
            `
        name: ${ONFT_ARGS.name}, 
        symbol: ${ONFT_ARGS.symbol}, 
        baseTokenURI: ${ONFT_ARGS.baseTokenURI}, 
        [${hre.network.name}] layerZeroEndpoint: ${ONFT_ARGS[hre.network.name].layerZeroEndpoint}, 
        maxSupply: ${ONFT_ARGS[hre.network.name].maxSupply}, 
        feeCollectorAddress: ${ONFT_ARGS.feeCollectorAddress}
        `
        )
    }
    hre.network.name != "hardhat" ? deployLog() : null

    await deploy("ONFT", {
        from: deployer,
        args: [
            ONFT_ARGS.name,
            ONFT_ARGS.symbol,
            ONFT_ARGS.baseTokenURI,
            ONFT_ARGS[hre.network.name].layerZeroEndpoint,
            ONFT_ARGS.feeCollectorAddress,
            ONFT_ARGS[hre.network.name].maxSupply,
        ],
        log: true,
        waitConfirmations: 1,
    })
}

module.exports.tags = ["ONFT"]
