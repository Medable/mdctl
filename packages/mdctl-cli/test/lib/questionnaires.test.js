const { expect } = require('chai'),
      { sortBy } = require('lodash'),
      { sortCredentials } = require('../../lib/questionnaires'),
      MemoryCredentialsProvider = require('../../../mdctl-core/credentials/memory_provider'),
      testEntries = [
        {
          environment: 'api-dev-eu1.medable.com/test1',
          input: {
            apiKey: 'ECovsjsdowe2334CN',
            username: 'test@medable.com',
            password: 'password1'
          }
        },
        {
          environment: 'api-dev.medable.cn/test2',
          input: {
            apiKey: '678gjfgdgsd43sdvCX',
            username: 'test@medable.cn',
            password: 'password3'
          }
        },
        {
          environment: 'api-int-dev.medable.com/test4',
          input: {
            apiKey: 'qwebtgyjndvcvhrgtui',
            username: 'test@medable.com',
            password: 'password2'
          }
        },
        {
          environment: 'api-dev.medable.com/test3',
          input: {
            apiKey: 'CSVFP23sfk345sdfk',
            username: 'test@medable.com',
            password: 'password2'
          }
        }
      ]


describe('MIG-144 - Test saved credential ', async() => {

  const credentialsProvider = new MemoryCredentialsProvider(),
        sortedCredentialsProvider = new MemoryCredentialsProvider()

  it('All entries should be sorted by Server, Environment and Org', async() => {

    const addPassword = [],
          sortedTestEntries = sortBy(testEntries, (p) => {
            const { environment, username, apiKey } = p,
                  [host, env] = environment.split('/')

            let domain = host.substring(0, host.indexOf('.medable')),
                server
            if (domain.indexOf('eu1') > 0) {
              server = 'Europe'
            } else if (host.endsWith('.com')) {
              server = 'US'
            } else {
              server = 'China'
            }
            domain = (domain === 'api' || domain === 'api-eu1') ? 'prod' : domain
            domain = domain.replace(/(api-|api.)/, '')

            return [server, domain, env, username, apiKey]
          })

    await credentialsProvider.clear()
    // Create unsorted credentials based on all items in testEntries array
    // eslint-disable-next-line no-restricted-syntax
    for (const password of testEntries) {
      addPassword.push(credentialsProvider.add(password.environment, password.input))
    }

    await sortedCredentialsProvider.clear()
    // Create Sorted credentials based on all items in sortedTestEntries array
    // eslint-disable-next-line no-restricted-syntax
    for (const password of sortedTestEntries) {
      addPassword.push(sortedCredentialsProvider.add(password.environment, password.input))
    }

    await Promise.all(addPassword)

    /*
      Sort the unsorted list of credentials and check this matches with the list of sorted
      credetials; basically we are testing the sorting algorithm works.
      If the sorting algorithm changes we obviously expect the test to fail
    */
    // eslint-disable-next-line one-var
    const passwordSecrets = sortCredentials(await credentialsProvider.list()),
          sortedPasswordSecret = await sortedCredentialsProvider.list()

    expect(passwordSecrets)
      .to.eql(sortedPasswordSecret)
  })
})
