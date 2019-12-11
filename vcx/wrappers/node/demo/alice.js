import {DisclosedProof} from "../dist/src/api/disclosed-proof";
import {Connection} from "../dist/src/api/connection";
import {Credential} from "../dist/src/api/credential";
import {StateType} from "../dist/src";
import {downloadMessages} from "./../dist/src/api/utils";
import readlineSync from 'readline-sync'
import sleepPromise from 'sleep-promise'
import * as demoCommon from './common'
import logger from './logger'
import url from 'url'
import isPortReachable from 'is-port-reachable';

const utime = Math.floor(new Date() / 1000);
const optionalWebhook =  "http://localhost:7209/notifications/alice"

const provisionConfig = {
    'agency_url': 'http://localhost:8080',
    'agency_did': 'VsKV7grR1BUE29mG2Fm2kX',
    'agency_verkey': 'Hezce2UWMZ3wUhVkh2LfKSs8nDzWwzs2Win7EzNN3YaR',
    'wallet_name': `node_vcx_demo_alice_wallet_${utime}`,
    'wallet_key': '123',
    'payment_method': 'null',
    'enterprise_seed': '000000000000000000000000Trustee1',
    "protocol_type": "2.0",
    "communication_method": "aries"
};

const logLevel = 'error';

function postegressEnabled() {
    return process.argv[2] === '--postgres'
}

async function run() {
    await demoCommon.initLibNullPay();

    logger.info("#7 initialize rust API from NodeJS");
    await demoCommon.initRustApiAndLogger(logLevel);

    if (postegressEnabled()) {
        logger.info("Going to initialize postgress plugin.")
        await demoCommon.loadPostgresPlugin(provisionConfig);
        logger.info("Postgress plugin initialized.")
        provisionConfig['wallet_type'] = 'postgres_storage'
        provisionConfig['storage_config'] = '{"url":"localhost:5432"}'
        provisionConfig['storage_credentials'] = '{"account":"postgres","password":"mysecretpassword","admin_account":"postgres","admin_password":"mysecretpassword"}'
    }

    if (await isPortReachable(url.parse(optionalWebhook).port, {host: url.parse(optionalWebhook).hostname})) {
        provisionConfig['webhook_url'] = optionalWebhook
        logger.info(`Webhook server available! Will use webhook: ${optionalWebhook}`)
    } else {
        logger.info(`Webhook url will not be used`)
    }

    logger.info("#8 Provision an agent and wallet, get back configuration details");
    let config = await demoCommon.provisionAgentInAgency(provisionConfig);

    logger.info("#9 Initialize libvcx with new configuration");
    await demoCommon.initVcxWithProvisionedAgentConfig(config);

    logger.info("Input faber.py invitation details");
    const details = readlineSync.question('Enter your invite details: ');
    const jdetails = JSON.parse(details);

    logger.info("#10 Convert to valid json and string and create a connection to faber");
    const connection_to_faber = await Connection.createWithInvite({id: 'faber', invite: JSON.stringify(jdetails)});
    await connection_to_faber.connect({data: '{"use_public_did": true}'});
    await connection_to_faber.updateState();
}

run();
