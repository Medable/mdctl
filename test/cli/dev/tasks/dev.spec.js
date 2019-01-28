const { expect } = require('chai'),
      _ = require('lodash'),
      Dev = require('./../../../../src/cli/tasks/env')

describe('dev', () => {

  describe('#getPasswordSecret', () => {
    const credentialsManagerMock = {
            get: (query) => {
              let mockedResult
              if (_.isEqual(query, { env: 'test-env' })) {
                mockedResult = { username: 'random@username.com' }
              } else if (_.isEqual(query, { env: 'test-env', endpoint: 'https://cool-endpoint.com' })) {
                mockedResult = { username: 'random2@username.com' }
              }
              return Promise.resolve(mockedResult)
            }
          },
          dev = new Dev(credentialsManagerMock)

    it('#getPasswordSecret receives only env', (done) => {

      dev.getPasswordSecret({ env: 'test-env' })
        .then((secret) => {
          expect(secret.username).to.be.eqls('random@username.com')
          done()
        })
        .catch(err => done(err))
    })

    it('#getPasswordSecret receives env and endpoint', (done) => {

      dev.getPasswordSecret({ env: 'test-env', endpoint: 'https://cool-endpoint.com' })
        .then((secret) => {
          expect(secret.username).to.be.eqls('random2@username.com')
          done()
        })
        .catch(err => done(err))
    })

    it('#getPasswordSecret receives invalid parameter', (done) => {

      dev.getPasswordSecret({ quite: true })
        .then((secret) => {
          expect(secret).to.be.eqls(undefined)
          done()
        })
        .catch(err => done(err))
    })
  })


})
