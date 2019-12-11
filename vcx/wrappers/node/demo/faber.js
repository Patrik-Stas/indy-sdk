import {CredentialDef} from "../dist/src/api/credential-def";
import {IssuerCredential} from "../dist/src/api/issuer-credential";
import {Proof} from "../dist/src/api/proof";
import {vcxUpdateWebhookUrl} from "../dist/src/api/utils";
import {Connection} from "../dist/src/api/connection";
import {downloadMessages} from "./../dist/src/api/utils";
import {Schema} from "./../dist/src/api/schema";
import {StateType, ProofState} from "../dist/src";
import sleepPromise from 'sleep-promise'
import * as demoCommon from "./common";
import {getRandomInt} from "./common";
import logger from './logger'
import url from 'url'
import isPortReachable from 'is-port-reachable';

const utime = Math.floor(new Date() / 1000);
const optionalWebhook =  "http://localhost:7209/notifications/faber"

const provisionConfig = {
    'agency_url': 'http://localhost:8080',
    'agency_did': 'VsKV7grR1BUE29mG2Fm2kX',
    'agency_verkey': 'Hezce2UWMZ3wUhVkh2LfKSs8nDzWwzs2Win7EzNN3YaR',
    'wallet_name': `node_vcx_demo_faber_wallet_${utime}`,
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

    logger.info("#0 Initialize rust API from NodeJS");
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

    logger.info(`#1 Config used to provision agent in agency: ${JSON.stringify(provisionConfig, null, 2)}`);
    const agentProvision = await demoCommon.provisionAgentInAgency(provisionConfig);

    logger.info(`#2 Using following agent provision to initialize VCX ${JSON.stringify(agentProvision, null, 2)}`);
    await demoCommon.initVcxWithProvisionedAgentConfig(agentProvision);

    const version = `${getRandomInt(1, 101)}.${getRandomInt(1, 101)}.${getRandomInt(1, 101)}`;
    const schemaData = {
        data: {
            attrNames: ['name', 'date', 'degree'],
            name: `FaberVcx`,
            version
        },
        paymentHandle: 0,
        sourceId: `your-identifier-fabervcx-${version}`
    };
    logger.info(`#3 Create a new schema on the ledger: ${JSON.stringify(schemaData, null, 2)}`);

    const schema = await Schema.create(schemaData);
    const schemaId = await schema.getSchemaId();
    logger.info(`Created schema with id ${schemaId}`);

    logger.info("#4 Create a new credential definition on the ledger");
    const data = {
        name: 'DemoCredential123',
        paymentHandle: 0,
        revocation: false,
        revocationDetails: {
            tailsFile: 'tails.txt',
        },
        schemaId: schemaId,
        sourceId: 'testCredentialDefSourceId123'
    };
    const cred_def = await CredentialDef.create(data);
    const cred_def_id = await cred_def.getCredDefId();
    const credDefHandle = cred_def.handle;
    logger.info(`Created credential with id ${cred_def_id} and handle ${credDefHandle}`);

    logger.info("#5 Create a connection to alice and print out the invite details");
    const connectionToAlice = await Connection.create({id: 'alice'});
    await connectionToAlice.connect('{}');
    await connectionToAlice.updateState();
    const details = await connectionToAlice.inviteDetails(false);
    logger.info("\n\n**invite details**");
    logger.info("**You'll ge queried to paste this data to alice side of the demo. This is invitation to connect.**");
    logger.info("**It's assumed this is obtained by Alice from Faber by some existing secure channel.**");
    logger.info("**Could be on website via HTTPS, QR code scanned at Faber institution, ...**");
    logger.info("\n******************\n\n");
    logger.info(JSON.stringify(JSON.parse(details)));
    logger.info("\n\n******************\n\n");

    logger.info("#6 Polling agency and waiting for alice to accept the invitation. (start alice.py now)");
    let connection_state = await connectionToAlice.getState();
    while (connection_state !== StateType.Accepted) {
        await sleepPromise(2000);
        await connectionToAlice.updateState();
        connection_state = await connectionToAlice.getState();

        logger.info(JSON.stringify(connection_state))
        let messages = await downloadMessages({})
        logger.info(`Messages = ${JSON.stringify(messages)}`)
    }
    logger.info(`Connection to alice was Accepted!`);
}

run();
