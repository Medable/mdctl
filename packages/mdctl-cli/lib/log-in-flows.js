
const _ = require('lodash'),
      {
        loadJsonOrYaml,
      } = require('@medable/mdctl-node-utils'),
      Environment = require('@medable/mdctl-core/credentials/environment'),
      {
        sortCredentials,
        askUserCredentials,
        askUserToSaveCredentials,
        askUserToChooseCredentials,
      } = require('../lib/questionnaires'),
      {
        loginWithExistingCredentials,
        logInWithPasswordSecret
      } = require('../lib/authentication')

async function storeCredentials(cli, credentials) {
  let result
  try {
    result = await cli.credentialsProvider.add(
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
        credentials = cli.credentialsProvider.create(
          new Environment(userCredentials),
          userCredentials
        )

  let result = false

  await logInWithPasswordSecret(cli)(credentials)
  result = true

  // eslint-disable-next-line one-var
  const existingCredentials = await cli.credentialsProvider.list(userCredentials)
  if (_.isEmpty(existingCredentials)) {
    const saveCredentials = await askUserToSaveCredentials()
    if (saveCredentials) await storeCredentials(cli, userCredentials)
  }

  return result
}

async function logInByChoosingCredentialsFlow(cli, completedOptions) {
  const existingPasswordSecrets = sortCredentials(await cli.credentialsProvider
    .list(completedOptions))

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
    logInResult = await logInByChoosingCredentialsFlow(cli, options)
                    || await logInRequestingCredentialsFlow(cli, options)
  } else {
    logInResult = await logInWithDefCredentialsFlow(cli)
                    || await logInByChoosingCredentialsFlow(cli, options)
                      || await logInRequestingCredentialsFlow(cli, options)
  }

  return logInResult
}

module.exports = {
  logInFlow
}
