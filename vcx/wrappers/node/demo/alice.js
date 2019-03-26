import {DisclosedProof} from "../dist/src/api/disclosed-proof";
import {Connection} from "../dist/src/api/connection";
import {Credential} from "../dist/src/api/credential";
import {StateType} from "../dist/src";
import readlineSync from 'readline-sync'
import sleepPromise from 'sleep-promise'
import * as demoCommon from './common'
import logger from './logger'
import {createStorage} from './storage'

const utime = Math.floor(new Date() / 1000);
const agencyEndpoint = 'http://localhost:8080';
const agencyDid = 'VsKV7grR1BUE29mG2Fm2kX';
const agencyVerkey = 'Hezce2UWMZ3wUhVkh2LfKSs8nDzWwzs2Win7EzNN3YaR';
const seed = '000000000000000000000000Trustee1';
// const agencyEndpoint = 'http://52.212.123.111:8080';

const provisionConfig = {
    'agency_url': agencyEndpoint,
    'agency_did': agencyDid,
    'agency_verkey': agencyVerkey,
    'wallet_name': `node_vcx_demo_alice_wallet_${utime}`,
    'wallet_key': '123',
    'payment_method': 'null',
    'enterprise_seed': seed
};

const logLevel = 'info';

function generateProvisionConfig(enterpriseSeed, agencyUrl, agencyDid, agencyVerkey, walletName) {
    const provisionConfig = {
        'agency_url': agencyUrl,
        'agency_did': agencyDid,
        'agency_verkey': agencyVerkey,
        'wallet_name': walletName,
        'wallet_key': 'key',
        'payment_method': 'null',
        'enterprise_seed': enterpriseSeed
    };

    return provisionConfig
}

const connectingAs = 'alice';

const genesisPath = `${__dirname}/docker.txn`;
// const genesisPath = `${__dirname}/testnet.txn`;

async function run() {
    const agentProvisionConfigs = await createStorage('agent-provisions');
    const connectionStorage = await createStorage('connections');

    logger.info("#0 initialize lib null pay");
    await demoCommon.initLibNullPay();

    logger.info("#0 initialize rust API from NodeJS");
    await demoCommon.initRustApiAndLogger(logLevel);

    const provisionAgentConfigKey = `${agencyEndpoint}-${seed}`;
    if (!(await agentProvisionConfigs.get(provisionAgentConfigKey))) {
        logger.info(`[Agent provisioning] No agent configuration was found for agency ${provisionAgentConfigKey}.`);
        logger.info(`[Agent provisioning] Using seed'${seed}' to create agent in '${agencyEndpoint}' agency.`);

        const provisionConfig = generateProvisionConfig(seed, agencyEndpoint, agencyDid, agencyVerkey, connectingAs);
        logger.debug(`[Agent provisioning] Config used to provision agent:\n${JSON.stringify(provisionConfig, null, 2)}\n`);

        const createdAgentConfig = await demoCommon.provisionAgentInAgency(provisionConfig);
        await agentProvisionConfigs.set(provisionAgentConfigKey, createdAgentConfig);
    }
    else {
        logger.info(`Found agent configuration for agency ${agencyEndpoint}. Will use that.`);
    }
    const provisionedAgentConfig = await agentProvisionConfigs.get(provisionAgentConfigKey);
    logger.info(`Loaded VCX Agent provisioning config:\n${JSON.stringify(provisionedAgentConfig, null, 2)}\n`);
    await demoCommon.initVcxWithProvisionedAgentConfig(provisionedAgentConfig, genesisPath);

    logger.info(`Agent is ready!`);

    logger.info(`Going to retrieve Faber connection information, or create new connection.`);
    if (!(await connectionStorage.get(connectingAs))) {
        logger.info(`We are connecting as '${connectingAs}'. This person was not yet connected to faber.`);
        logger.info("#9 Input faber.py invitation details");
        const details = readlineSync.question('Enter your invite details: ');
        const jdetails = JSON.parse(details);
        logger.info("#10 Convert to valid json and string and create a connection to faber");
        const connection_to_faber = await Connection.createWithInvite({id: 'faber', invite: JSON.stringify(jdetails)});
        await connection_to_faber.connect({data: '{"use_public_did": true}'});
        await connection_to_faber.updateState();

        const serialized = await connection_to_faber.serialize();
        connectionStorage.set(connectingAs, serialized);
    } else {
        logger.info(`We are connecting as ${connectingAs} and connection was already established before. Will be loaded.`);
    }
    const connection_to_faber_serialized = await connectionStorage.get(connectingAs);
    const connection_to_faber = await Connection.deserialize(connection_to_faber_serialized);

    logger.info(`Connection object is ready.`);
    logger.info(`Sending message to Faber`);
    connection_to_faber.sendMessage("Hello world. This your frend.")

    // logger.info("#11 Wait for faber.py to issue a credential offer");
    // await sleepPromise(5000);
    // const offers = await Credential.getOffers(connection_to_faber);
    // logger.info(`Alice found ${offers.length} credential offers.`);
    // logger.debug(JSON.stringify(offers));
    //
    // // Create a credential object from the credential offer
    // const credential = await Credential.create({sourceId: 'credential', offer: JSON.stringify(offers[0])});
    //
    // logger.info("#15 After receiving credential offer, send credential request");
    // await credential.sendRequest({connection: connection_to_faber, payment : 0});
    //
    // logger.info("#16 Poll agency and accept credential offer from faber");
    // let credential_state = await credential.getState();
    // while (credential_state !== StateType.Accepted) {
    //     sleepPromise(2000);
    //     await credential.updateState();
    //     credential_state = await credential.getState();
    // }
    //
    // logger.info("#22 Poll agency for a proof request");
    // const requests = await DisclosedProof.getRequests(connection_to_faber);
    //
    // logger.info("#23 Create a Disclosed proof object from proof request");
    // const proof = await DisclosedProof.create({sourceId: 'proof', request: JSON.stringify(requests[0])});
    //
    // logger.info("#24 Query for credentials in the wallet that satisfy the proof request");
    // const credentials = await proof.getCredentials();
    //
    // // Use the first available credentials to satisfy the proof request
    // for (let i = 0; i < Object.keys(credentials['attrs']).length; i++) {
    //     const attr = Object.keys(credentials['attrs'])[i];
    //     credentials['attrs'][attr] = {
    //         'credential': credentials['attrs'][attr][0]
    //     }
    // }
    //
    // logger.info("#25 Generate the proof");
    // await proof.generateProof({selectedCreds: credentials, selfAttestedAttrs: {}});
    //
    // logger.info("#26 Send the proof to faber");
    // await proof.sendProof(connection_to_faber);
}


run();