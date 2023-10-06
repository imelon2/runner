import { Contract, Wallet, ethers } from "ethers"
import { abi } from './contracts/Order.sol/Order.json'
import logger from "./logger"

const address = '0x4a82c83efaaF63d0ad4aC45D1A88BE666e8cFD72'
const url = 'https://polygon-testnet-rpc.allthatnode.com:8545/mgMzRYm4Y33DRV3itfp21os56xny9fjU'
const Provider = new ethers.providers.JsonRpcProvider({ url: url, timeout: 5000 })
const wallet = new Wallet('0x0551955b386bb7a73be064aa45bdf06aeadefd3c4ddc2c1e7dccb79afe06629e', Provider)
const order = new Contract(address, abi, wallet)

const getOrder = async () => {
    const result = await order.getOrder(2)
    return !!result[0];
}

const errorMsg = (error: any) => {
    if (error.error?.code) {
        logger.warn(`[LAST RETRY] eth_call : ${error.error.code}`)
    } else if (error.code) {
        logger.warn(`[LAST RETRY] getNetwork : ${error.code}`)
    } else {
        logger.error(`[LAST RETRY] Unexpected Error : ${error}`)
    }
}
const retryErrorMsg = (error: any , count :number) => {
    let msg;
    if(count === 2) msg = "FIRST"
    if(count === 1) msg = "SECOND"

    if (error.error?.code) {
        logger.warn(`[${msg} RETRY] eth_call : ${error.error.code}`)
    } else if(error.code) {
        logger.warn(`[${msg} RETRY] getNetwork : ${error.code}`)
    } else {
        logger.error(`[${msg} RETRY] Unexpected Error : ${error}`)
    }
}

const retryRpcPromiseRequest = async (promise: () => Promise<any>, retriesLeft = 2): Promise<any> => {
    try {
        return await promise();
    } catch (error) {
        if (retriesLeft === 0) {
            errorMsg(error)
            return Promise.reject(error);
        }
        retryErrorMsg(error, retriesLeft)
        await sleep(1000);
        return retryRpcPromiseRequest(promise, retriesLeft - 1);
    }
}

// 동기 지연 함수
const sleep = async (ms: number): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, ms));
};

const runner = () => {
    let start = false;
    let timer: any;

    const run = async () =>
        timer = setInterval(async () => {
            try {
                if (timer != null && start) return;
                start = true
                const result = await retryRpcPromiseRequest(async () => await getOrder())
                if (result) {
                    start = false
                }
            } catch (error) {
                cancel()
                run()
            }
        }, 1000)

    const cancel = () => {
        if (timer == null) { return; }
        clearInterval(timer)
        timer = null;
        start = false
    }

    return { run, cancel }
}

(async () => {
    console.log('START RUN CODE...🚀');
    
    runner().run();

})()