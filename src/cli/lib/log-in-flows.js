
const _ = require('lodash'),
      {
        loadJsonOrYaml,
      } = require('../../lib/utils'),
      {
        CredentialsManager,
      } = require('../../lib/api/credentials'),
      Environment = require('../../lib/api/environment'),
      {
        askUserCredentials,
        askUserToSaveCredentials,
        askUserToChooseCredentials,
      } = require('../lib/questionnaires'),
      {
        loginWithExistingCredentials,
        logInWithPasswordSecret
      } = require('../lib/authentication')

async function storeCredentials(credentials) {
  let result
  try {
    result = await CredentialsManager.add(
      new Environment(credentials),
      credentials
    )
  } catch (err) {
    // TODO: Remove this kind of { objhect: fault } declarations and use class Fault
    result = _.extend(_.clone(result), { object: 'fault' })
  }
  return result
}

async function logInRequestingCredentialsFlow(cli, completedOptions) {
  const userCredentials = await askUserCredentials(completedOptions),
        passwordSecret = CredentialsManager.create(
          new Environment(userCredentials),
          userCredentials
        )

  let result = false

  await logInWithPasswordSecret(cli)(passwordSecret)
  result = true

  // eslint-disable-next-line one-var
  const existingCredentials = await CredentialsManager.list(userCredentials)
  if (_.isEmpty(existingCredentials)) {
    const saveCredentials = await askUserToSaveCredentials()
    if (saveCredentials) await storeCredentials(userCredentials)
  }

  return result
}

async function logInByChoosingCredentialsFlow(cli, completedOptions) {
  const existingPasswordSecrets = await CredentialsManager.list(completedOptions)

  let result = false

  if (existingPasswordSecrets.length > 0) {
    const existingPasswordIdx = await askUserToChooseCredentials(existingPasswordSecrets)
    if (existingPasswordIdx > -1) {
      await logInWithPasswordSecret(cli)(existingPasswordSecrets[existingPasswordIdx])
      result = true
    }
  }

  return result
}

async function logInWithDefCredentialsFlow(cli) {
  const defaultCredentials = cli.config('defaultCredentials')
  let result = false

  if (defaultCredentials && defaultCredentials.type === 'password') {
    await loginWithExistingCredentials(cli)(defaultCredentials)
    result = true
  }
  return result
}


async function logInFlow(cli) {
  const filteringArguments = ['endpoint', 'env', 'username', 'apiKey'],
        allowedArguments = filteringArguments.concat(['file', 'strictSSL']),
        parsedArguments = cli.getArguments(allowedArguments),
        areFilteringArgsPassed = parsedArgs => _.intersection(_(parsedArgs).keys().value(),
          filteringArguments).length > 0,
        readFile = async(filePath) => {
          const result = await loadJsonOrYaml(filePath)
          return _.pick(result, 'endpoint', 'env', 'username', 'apiKey', 'password')
        },
        options = _.has(parsedArguments, 'file') ? await readFile(parsedArguments.file) : _.extend(_.clone(parsedArguments), { type: 'password' })

  let logInResult = false
  if (areFilteringArgsPassed(parsedArguments)) {
    logInResult = await logInWithDefCredentialsFlow(cli)
                      || await logInByChoosingCredentialsFlow(cli, options)
                          || await logInRequestingCredentialsFlow(cli, options)
  } else {
    logInResult = await logInByChoosingCredentialsFlow(cli, options)
                      || await logInRequestingCredentialsFlow(cli, options)
  }

  return logInResult
}

module.exports = {
  logInFlow
}
