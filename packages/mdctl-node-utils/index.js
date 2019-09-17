const fs = require('fs'),
      jsyaml = require('js-yaml'),
      path = require('path'),
      KeytarCredentialsProvider = require('@medable/mdctl-credentials-provider-keychain'),
      PouchDbCredentialsProvider = require('@medable/mdctl-credentials-provider-pouchdb'),
      { randomAlphaNumSym } = require('./crypto')

async function loadJsonOrYaml(file, multi) {
  if (path.extname(file) === '.yaml') {
    const docs = []
    jsyaml.safeLoadAll(fs.readFileSync(file, 'utf8'), d => docs.push(d), { filename: file })
    return multi ? docs : docs[0] || {}
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

async function getCredProvider() {
  const keyProvider = new KeytarCredentialsProvider('com.medable.mdctl'),
    configureDir = path.join(os.homedir(), '.medable')

  let encryptionKey = process.env.MDCTL_CLI_ENCRYPTION_KEY || await keyProvider.getCustom('pouchKey', '*')

  if (!fs.existsSync(configureDir)) {
    fs.mkdirSync(configureDir, { recursive: true })
  }

  if (!encryptionKey) {
    encryptionKey = randomAlphaNumSym(32)
    await keyProvider.setCustom('pouchKey', '*', encryptionKey)
  }

  return new PouchDbCredentialsProvider({
    name: path.join(configureDir, 'mdctl.db'),
    key: encryptionKey
  })
}

async function loadDefaults() {

  const configureDir = path.join(os.homedir(), '.medable'),
    configureFile = path.join(configureDir, 'mdctl.yaml'),
    localFile = path.join('./mdctl.yaml')

  try {
    let config = null
    if (fs.existsSync(localFile)) {
      config = (await loadJsonOrYaml(localFile))
    }
    if (!config) {
      config = (await loadJsonOrYaml(configureFile))
    }
    return config
  } catch (err) {
    return {}
  }

}

async function getDefaultClient() {
  const credentialsProvider = await getCredProvider(),
    defaultCreds = await loadDefaults(),
    defaultPasswordSecret = await credentialsProvider.get(defaultCreds.defaultCredentials),
    activeLogin = await credentialsProvider.getCustom('login', '*'),
    activeClientConfig = _.get(activeLogin, 'client'),
    activeCredentials = activeLogin
      ? {
        username: activeLogin.client.credentials.username,
        apiKey: activeLogin.client.credentials.apiKey,
        password: activeLogin.password
      }
      : defaultPasswordSecret,
    client = activeLogin
      ? Object.assign(
        activeClientConfig,
        { provider: credentialsProvider, credentials: activeCredentials }
      )
      : { credentials: defaultPasswordSecret, provider: credentialsProvider}

  return client
}


module.exports = {
  loadJsonOrYaml,
  getDefaultClient
}
