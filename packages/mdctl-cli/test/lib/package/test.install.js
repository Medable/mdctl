// eslint-disable-next-line import/no-extraneous-dependencies
const sinon = require('sinon'),
      { Client } = require('@medable/mdctl-api'),
      Package = require('../../../../mdctl-packages'),
      { Cortex } = require('../../../lib/package/source'),
      { installPkg } = require('../../../lib/package/index')

describe('Install Package Test', () => {

  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('Test install local package into cortex', async() => {
    const packageEvaluateStub = sandbox.stub(Package.prototype, 'evaluate').resolves(),
          cortexPublishStub = sandbox.stub(Cortex.prototype, 'installPackage').resolves(),
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

    await installPkg('', { client })

    sinon.assert.calledOnce(packageEvaluateStub)
    sinon.assert.calledOnce(cortexPublishStub)
  })

  it('Test install registry package into cortex', async() => {
    const packageEvaluateStub = sandbox.stub(Package.prototype, 'evaluate').resolves(),
          cortexPublishStub = sandbox.stub(Cortex.prototype, 'installPackage').resolves(),
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

    await installPkg('TestPackage', {
      registryUrl: 'test_registry_url',
      registryProjectId: 'test_registry_project_id',
      registryToken: 'test_registry_token',
      client,
    })

    sinon.assert.calledOnce(packageEvaluateStub)
    sinon.assert.calledOnce(cortexPublishStub)
  })

})
