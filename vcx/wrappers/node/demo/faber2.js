const { IssuerCredential } = require('../dist/src/api/issuer-credential')
const { Connection } = require('../dist/src/api/connection')
const sleepPromise = require('sleep-promise')
const demoCommon = require('./common')
const logger = require('./logger')
const { runScript } = require('./script-comon')
const fs = require('fs')

const utime = Math.floor(new Date() / 1000)

const provisionConfig = {
  agency_url: 'http://localhost:8080',
  agency_did: 'VsKV7grR1BUE29mG2Fm2kX',
  agency_verkey: 'Hezce2UWMZ3wUhVkh2LfKSs8nDzWwzs2Win7EzNN3YaR',
  wallet_name: `node_vcx_demo_faber_wallet_${utime}`,
  wallet_key: '123',
  payment_method: 'null',
  enterprise_seed: '000000000000000000000000Trustee1'
}

const logLevel = 'error'

async function runFaber (options) {
  await demoCommon.initLibNullPay()

  logger.info('#0 Initialize rust API from NodeJS')
  await demoCommon.initRustApiAndLogger(logLevel)
  provisionConfig.protocol_type = '2.0'
  provisionConfig.communication_method = 'aries'

  const agentProvision = JSON.parse(fs.readFileSync('faber1_provision.json'))
  logger.info(`#2 Using following agent provision to initialize VCX ${JSON.stringify(agentProvision, null, 2)}`)
  await demoCommon.initVcxWithProvisionedAgentConfig(agentProvision)

  // eslint-disable-next-line no-unused-vars
  const connectionToAlice = await Connection.deserialize(JSON.parse(fs.readFileSync('connectionToAlice.json')))
  logger.info(`Loaded connectionToAlice; Deserialized: ${JSON.stringify(connectionToAlice)}`)

  const credentialForAlice = await IssuerCredential.deserialize(JSON.parse(fs.readFileSync('credentialForAlice.json')))
  logger.warn('Loaded credentialForAlice!')

  // let credentialState = await credentialForAlice.getState()
  logger.warn('Going to call credentialForAlice.updateState()!')
  await credentialForAlice.updateState()
  logger.warn('Finished credentialForAlice.updateState()!')

  // logger.info('#17 Issue credential to alice')
  // await credentialForAlice.sendCredential(connectionToAlice)

  process.exit(0)
}

const optionDefinitions = [
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Display this usage guide.'
  },
  {
    name: 'comm',
    type: String,
    description: 'Communication method. Possible values: aries, legacy. Default is aries.',
    defaultValue: 'aries'
  },
  {
    name: 'postgresql',
    type: Boolean,
    description: 'If specified, postresql wallet will be used.',
    defaultValue: false
  }
]

const usage = [
  {
    header: 'Options',
    optionList: optionDefinitions
  },
  {
    content: 'Project home: {underline https://github.com/Patrik-Stas/indy-wallet-watch}'
  }
]

function areOptionsValid (options) {
  const allowedCommMethods = ['aries', 'legacy']
  if (!(allowedCommMethods.includes(options.comm))) {
    console.error(`Unknown communication method ${options.comm}. Only ${JSON.stringify(allowedCommMethods)} are allowed.`)
    return false
  }
  return true
}

runScript(optionDefinitions, usage, areOptionsValid, runFaber)
