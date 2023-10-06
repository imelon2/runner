const express = require("express");
const { Contract, Wallet, ethers } = require("ethers");
const { abi } = require("./contracts/Order.sol/Order.json");
const logger = require("./logger.js");

const address = "0x4a82c83efaaF63d0ad4aC45D1A88BE666e8cFD72";
const urls = [
  "https://polygon-mumbai.infura.io/v3/d269e2226158443ea6b9b4a06afe77f2",
  "https://polygon-testnet-rpc.allthatnode.com:8545/uuPryfzIVwN7gRDw9v5Zzw6jdDHPw11p",
  "https://polygon-mumbai.g.alchemy.com/v2/7qZHosmwerQ3WfaeSmx74rQkW-zTudyl",
];
// const url = 'https://polygon-testnet-rpc.allthatnode.com:8545/mgMzRYm4Y33DRV3itfp21os56xny9fjU' // LODIS PROVIDER
let url = urls[0];
let timeout = 1;
let Provider = new ethers.providers.JsonRpcProvider({ url, timeout });
let wallet = new Wallet(
  "0x0551955b386bb7a73be064aa45bdf06aeadefd3c4ddc2c1e7dccb79afe06629e",
  Provider
);
let order = new Contract(address, abi, wallet);

const SwitchProvider = async () => {
  let index = urls.indexOf(url);
  url = urls[(index + 1) % urls.length];
  Provider = new ethers.providers.JsonRpcProvider({ url, timeout });
  wallet = new Wallet(
    "0x0551955b386bb7a73be064aa45bdf06aeadefd3c4ddc2c1e7dccb79afe06629e",
    Provider
  );
  order = new Contract(address, abi, wallet);
  logger.warn(`[RUN SWITCH PROVIDER] : ${Provider.connection.url}`);
};

const getOrder = async () => {
  const result = await order.getOrder(2);
  return !!result[0];
};

const successRetry = () => {
  logger.info(`[SUCCESS RETRY]`);
};

const errorMsg = (error) => {
  if (error.error?.code) {
    logger.warn(`[LAST RETRY] eth_call : ${error.error.code}`);
  } else if (error.code) {
    if (error.code === "NETWORK_ERROR")
      logger.warn(`[LAST RETRY] getNetwork : ${error.code}`);
  } else {
    logger.error(`[LAST RETRY] Unexpected Error : ${error}`);
  }
};
const retryErrorMsg = (error, count) => {
  let msg;
  if (count === 2) msg = "FIRST";
  if (count === 1) msg = "SECOND";

  if (error.error?.code) {
    logger.warn(`[${msg} RETRY] eth_call : ${error.error.code}`);
  } else if (error.code) {
    if (error.code === "NETWORK_ERROR")
      logger.warn(`[${msg} RETRY] getNetwork : ${error.code}`);
  } else {
    logger.error(`[${msg} RETRY] Unexpected Error : ${error}`);
  }
};

const retryWithSwitchProvider = async (
  promise,
  switchProvider,
  retriesLeft = urls.length
) => {
  try {
    const result = await retryRpcPromiseRequest(promise);
    return result;
  } catch (error) {
    if (retriesLeft === 0) {
      return Promise.reject(error);
    }
    // logger.warn(`rpcRequest: ${retriesLeft} retries left`);
    await sleep(1000);
    await switchProvider();
    await sleep(1000);
    return retryWithSwitchProvider(
      async () => await promise(),
      SwitchProvider,
      retriesLeft - 1
    );
  }
};

const retryRpcPromiseRequest = async (promise, retriesLeft = 2) => {
  try {
    const result = await promise();
    if (retriesLeft != 2) {
      successRetry();
    }
    return result;
  } catch (error) {
    if (retriesLeft === 0) {
      errorMsg(error);
      return Promise.reject(error);
    }
    retryErrorMsg(error, retriesLeft);
    await sleep(1000);
    return retryRpcPromiseRequest(promise, retriesLeft - 1);
  }
};

// 동기 지연 함수
const sleep = async (ms) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const runner = () => {
  let start = false;
  let timer;

  const run = async () =>
    (timer = setInterval(async () => {
      try {
        if (timer != null && start) return;
        start = true;
        const result = await retryWithSwitchProvider(
          async () => await getOrder(),
          async () => await SwitchProvider()
        );
        if (result) {
          start = false;
        }
      } catch (error) {
        cancel();
        run();
      }
    }, 1000));

  const cancel = () => {
    if (timer == null) {
      return;
    }
    clearInterval(timer);
    timer = null;
    start = false;
  };

  return { run, cancel };
};

const unrunner = async () => {
  try {
    const result = await retryWithSwitchProvider(
      async () => await getOrder(),
      async () => await SwitchProvider()
    );
    console.log("SUCCESS : ", result);
  } catch (error) {
    console.log("END");
  }
};

const app = express();
app.set("port", process.env.PORT || 8000);
app.listen(app.get("port"), () => {
  console.log(app.get("port"), "번 포트에서 대기중");
  console.log("START RUN CODE...🚀");

  runner().run();
});
