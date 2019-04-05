import {DisclosedProof} from "../dist/src/api/disclosed-proof";
import {Connection} from "../dist/src/api/connection";
import {Credential} from "../dist/src/api/credential";
import {StateType} from "../dist/src";
import readlineSync from 'readline-sync'
import sleepPromise from 'sleep-promise'
import * as demoCommon from './common'
import logger from './logger'
import {createStorage} from './storage'
import axios from 'axios'

const agencyEndpoint = 'http://localhost:8080';
// const agencyEndpoint = 'http://52.212.123.111:8080';

const seed = '00000000000000000000000000000001';

const logLevel = process.env.VCX_LOG_LEVEL || 'info';

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


const genesisPath = `${__dirname}/docker.txn`;

const CLIENT_ACTIONS = {
    "SEND_MSG": "SEND_MSG",
    "CHECK_CRED_OFFERS": "CHECK_CRED_OFFERS",
    "ACCEPT_CRED_OFFERS": "ACCEPT_CRED_OFFERS",
    "SIGN_DATA": "SIGN_DATA",
};

const DO_ACTIONS = [CLIENT_ACTIONS.ACCEPT_CRED_OFFERS];
// const DO_ACTIONS = [CLIENT_ACTIONS.CHECK_CRED_OFFERS];
// const DO_ACTIONS = [];s


async function initLibvcx() {
    logger.info(`-----------------------------------------------------------`);
    logger.info(`Initilizing libvcx`);
    logger.info(`-----------------------------------------------------------`);

    logger.info("#0 initialize lib null pay");
    await demoCommon.initLibNullPay();

    logger.info("#0 initialize rust API from NodeJS");
    await demoCommon.initRustApiAndLogger(logLevel);
}

async function assureAgentInAgency(clientName) {
    logger.info(`-----------------------------------------------------------`);
    logger.info(`Assuring agent in agency for client ${clientName}`);
    logger.info(`-----------------------------------------------------------`);
    const agentProvisionConfigs = await createStorage('client-agent-provisions');

    const {data: { DID: agencyDid, verKey: agencyVerkey}} = await axios.get(`${agencyEndpoint}/agency`);
    logger.info(`Dicovered Agency did: ${agencyDid}`);
    logger.info(`Dicovered Agency verkey: ${agencyVerkey}`);

    const provisionAgentConfigKey = `${clientName}-${agencyEndpoint}-${seed}`;
    if (!(await agentProvisionConfigs.get(provisionAgentConfigKey))) {
        logger.info(`[Agent provisioning] No agent configuration was found for agency ${provisionAgentConfigKey}.`);
        logger.info(`[Agent provisioning] Using seed'${seed}' to create agent in '${agencyEndpoint}' agency.`);

        const provisionConfig = generateProvisionConfig(seed, agencyEndpoint, agencyDid, agencyVerkey, clientName);
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
}

async function createOrRetrieveConnection(storageConnection, clientName, peerName = 'faber') {
    logger.info(`Going to retrieve connection information, or create new connection.`);
    const connectionId = `${clientName}-to-${peerName}`;
    if (!(await storageConnection.get(connectionId))) {
        logger.info(`We are connecting as '${clientName}' to ${peerName}. This person was not yet connected to faber.`);
        logger.info("#9 Input faber.py invitation details");
        const details = readlineSync.question('Enter your invite details: ');
        const jdetails = JSON.parse(details);
        logger.info("#10 Convert to valid json and string and create a connection to faber");
        const connection = await Connection.createWithInvite({id: peerName, invite: JSON.stringify(jdetails)});
        logger.info("#10 Connection objectcreated");
        await connection.connect({data: '{"use_public_did": true}'});
        logger.info("#10 Connected");
        await connection.updateState();
        logger.info("#10 Updated state");

        const serialized = await connection.serialize();
        logger.info("#10 Serialized connection");
        await storageConnection.set(connectionId, serialized);
        logger.info("#10 Saved Serialized connection");
    } else {
        logger.info(`We are connecting as '${clientName}' and connection was already established before. Will be loaded.`);
    }
    logger.info(`#10 Retrieveing connection for ${clientName}`);
    const connectionSerialized = await storageConnection.get(connectionId);
    logger.info(`#10 Loaded connection data ${JSON.stringify(connectionSerialized)}`);
    const connection = await Connection.deserialize(connectionSerialized);
    return connection
}

async function sendMessage(connection) {
    logger.info(`Connection object is ready.`);
    await connection.sendMessage({msg: "are you there?", type: "question", title: "Sending moar"})
}

async function getAndAcceptCredOffers(connection) {
    const offers = await Credential.getOffers(connection);

    logger.info(`---------------------------------------------------------------------------------------------------`);
    logger.info(`Found ${offers.length} credential offers.`);
    logger.info(`---------------------------------------------------------------------------------------------------`);
    logger.debug(JSON.stringify(offers));

    // Create a credential object from the credential offer
    const credential = await Credential.create({sourceId: 'credential', offer: JSON.stringify(offers[0])});

    logger.info(`---------------------------------------------------------------------------------------------------`);
    logger.info(`Sending credential request for offer ${JSON.stringify(offers[0])}`);
    logger.info(`---------------------------------------------------------------------------------------------------`);
    await credential.sendRequest({connection: connection, payment: 0});

    logger.info("#16 Poll agency and accept credential offer from faber");
    let credentialState = await credential.getState();
    logger.info(`After sending credential request, the statee of credential is ${credentialState}`);
    while (credentialState !== StateType.Accepted) {
        sleepPromise(2000);
        await credential.updateState();
        logger.info(`Polling credential status ... status=${credentialState}`);
        credentialState = await credential.getState();
    }
}

async function getCredOffers(connection) {
    const offers = await Credential.getOffers(connection);

    logger.info(`---------------------------------------------------------------------------------------------------`);
    logger.info(`Found ${offers.length} credential offers.`);
    logger.info(`---------------------------------------------------------------------------------------------------`);
    logger.debug(JSON.stringify(offers));

}


async function signData(connection) {
    var data = Buffer.from('0123456789', 'utf8');
    const signed = await connection.signData(data);
    console.log(JSON.stringify(signed))
}

async function executeClientAction(action, connection, clientIdentity, connectingTo) {

    logger.info(`---------------------------------------------------------------------------------------------------`);
    logger.info(`Executing '${action}' between client '${clientIdentity}' and peer '${connectingTo}'.`);
    logger.info(`---------------------------------------------------------------------------------------------------`);
    switch (action) {
        case CLIENT_ACTIONS.SEND_MSG:
            await sendMessage(connection);
            break;
        case CLIENT_ACTIONS.ACCEPT_CRED_OFFERS:
            await getAndAcceptCredOffers(connection);
            break;
        case CLIENT_ACTIONS.CHECK_CRED_OFFERS:
            await getCredOffers(connection);
            break

        case CLIENT_ACTIONS.SIGN_DATA:
            await signData(connection);
            break
        default:
            throw Error(`Unknown action ${action}`);
    }
}


async function run() {
    const clientIdentity = process.env.CLIENT_NAME || 'alice';
    const connectingTo = 'absa';

    await initLibvcx();
    await assureAgentInAgency(clientIdentity);
    const connectionStorage = await createStorage('client-connections');

    const connection = await createOrRetrieveConnection(connectionStorage, clientIdentity, connectingTo);
    for (const action of DO_ACTIONS) {
        await executeClientAction(action, connection, clientIdentity, connectingTo)
    }
}

run();