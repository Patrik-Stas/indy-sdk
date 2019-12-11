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
    "protocol_type": "2.0"
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
    logger.info('Connecting to Faber.')
    await connection_to_faber.connect({data: '{"use_public_did": true}'});
    logger.info('Updating connection state')
    await connection_to_faber.updateState();
    logger.info(`Connection after update: ${JSON.stringify(connection_to_faber)}`)
    logger.info(`Connection after update: ${JSON.stringify(await connection_to_faber.serialize())}`)

    logger.info("#11 Wait for faber.py to issue a credential offer");
    await sleepPromise(10000);
    const offers = await Credential.getOffers(connection_to_faber);
    logger.info(`Alice found ${offers.length} credential offers.`);
    logger.debug(JSON.stringify(offers));

    // Create a credential object from the credential offer
    const credential = await Credential.create({sourceId: 'credential', offer: JSON.stringify(offers[0])});
    await credential.updateState()

    credential_state = await credential.getState();
    logger.info(`Credential instance created from credential offer is in state ${credential_state}`)


    logger.info("Sending credential request!");
    await credential.sendRequest({connection: connection_to_faber, payment : 0});

    // await credential.updateState()
    // credential_state = await credential.getState();
    // logger.info(`Credential instance created from credential offer after update is in state ${credential_state}`)


    await credential.updateState()
    credential_state = await credential.getState();
    logger.info(`After sending credential request, it is in state ${credential_state}`)


    logger.info("Waiting credential to pass initialized state");
    let credential_state = await credential.getState();
    while (credential_state === StateType.Initialized) {
        await sleepPromise(2000);
    }

    logger.info("credential in OfferSent. We now send request");
    if (credential_state === StateType.OfferSent) {
        logger.info("Sending credential requst!");

    }

    logger.info("#16 Poll agency and accept credential from faber");
    credential_state = await credential.getState();
    while (credential_state !== StateType.Accepted) {
        await sleepPromise(2000);
        await credential.updateState();
        credential_state = await credential.getState();
        logger.info(JSON.stringify(credential_state))
        let messages = await downloadMessages({})
        logger.info(`Messages = ${JSON.stringify(messages)}`)
    }

    logger.info("#22 Poll agency for a proof request");
    const requests = await DisclosedProof.getRequests(connection_to_faber);

    logger.info("#23 Create a Disclosed proof object from proof request");
    const proof = await DisclosedProof.create({sourceId: 'proof', request: JSON.stringify(requests[0])});

    logger.info("#24 Query for credentials in the wallet that satisfy the proof request");
    const credentials = await proof.getCredentials();

    // Use the first available credentials to satisfy the proof request
    for (let i = 0; i < Object.keys(credentials['attrs']).length; i++) {
        const attr = Object.keys(credentials['attrs'])[i];
        credentials['attrs'][attr] = {
            'credential': credentials['attrs'][attr][0]
        }
    }

    logger.info("#25 Generate the proof");
    await proof.generateProof({selectedCreds: credentials, selfAttestedAttrs: {}});

    logger.info("#26 Send the proof to faber");
    await proof.sendProof(connection_to_faber);
}

run();
