// eslint-disable-next-line import/no-extraneous-dependencies
const sinon = require('sinon'),
      path = require('path'),
      fs = require('fs'),
      FormData = require('form-data'),
      { Client } = require('@medable/mdctl-api'),
      ZipTree = require('../../../../mdctl-packages/lib/zip_tree'),
      { Cortex } = require('../../../lib/package/source')

describe('Cortex Test', () => {

  let cortex,
      sandbox,
      client

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    client = new Client({
      strictSSL: false,
      environment: {
        endpoint: 'https://localhost',
        env: 'test'
      },
      credentials: {
        type: 'password',
        apiKey: 'abcdefghijklmnopqrstuv',
        username: 'test@medable.com',
        password: 'password'
      }
    })
    cortex = new Cortex('TestPackage', 'latest', { client })
  })

  afterEach(() => {
    cortex = null
    client = null
    sandbox.restore()
  })

  it('Test publish package to cortex', async() => {
    let isZipStreamDrained = false,
        isFormSubmitCalled = false

    const packageZipTree = new ZipTree(path.resolve(__dirname, 'test_pkg'), { fs }),
          packageZipStream = await packageZipTree.compress(),
          clientFacetStub = sandbox.stub(client, 'call').resolves({
            uploads: [
              {
                uploadUrl: 'test_upload_url',
                uploadKey: 'test_upload_key',
                fields: [{
                  key: 'x-amz-credential',
                  value: 'x-amz-credential-test'
                }, {
                  key: 'x-amz-date',
                  value: '20220118T041333Z'
                }, {
                  key: 'x-amz-server-side-encryption',
                  value: 'AES256'
                }, {
                  key: 'x-amz-signature',
                  value: 'x-amz-signature-test'
                }, {
                  key: 'x-amz-algorithm',
                  value: 'AWS4-HMAC-SHA256'
                }, {
                  key: 'success_action_status',
                  value: '201'
                }, {
                  key: 'content-type',
                  value: 'application/zip'
                }, {
                  key: 'key',
                  value: 'test_key'
                }, {
                  key: 'policy',
                  value: 'policy_test'
                }
                ]
              }
            ]
          })

    packageZipStream.on = (message, handler) => {
      if (message === 'data') {
        handler(Buffer.from('test_data_begin'))
      } else if (message === 'end') {
        isZipStreamDrained = true
        handler(Buffer.from('test_data_end'))
      }
    }

    FormData.prototype.submit = (uploadUrl, callback) => {
      isFormSubmitCalled = true
      callback(null, { statusCode: 200 })
    }

    await cortex.publishPackage(packageZipStream)

    sinon.assert.calledOnce(clientFacetStub)
    sinon.assert.match(isZipStreamDrained, true)
    sinon.assert.match(isFormSubmitCalled, true)
  })

})
