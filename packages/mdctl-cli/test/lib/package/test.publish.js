// eslint-disable-next-line import/no-extraneous-dependencies
const sinon = require('sinon'),
      path = require('path'),
      fs = require('fs'),
      { Client } = require('@medable/mdctl-api'),
      Package = require('../../../../mdctl-packages'),
      { Registry, Cortex } = require('../../../lib/package/source'),
      ZipTree = require('../../../../mdctl-packages/lib/zip_tree'),
      { publishPkg } = require('../../../lib/package/index')

describe('Publish Package Test', () => {

  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('Test publish package to registry', async() => {
    const packageZipTree = new ZipTree(path.resolve(__dirname, 'test_pkg'), { fs }),
          packageZipStream = await packageZipTree.compress(),
          packageEvaluateStub = sandbox.stub(Package.prototype, 'evaluate').resolves(),
          packageGetStreamStub = sandbox.stub(Package.prototype, 'getPackageStream').resolves(packageZipStream),
          registryPublishStub = sandbox.stub(Registry.prototype, 'publishPackage').resolves()

    await publishPkg('TestPackage', {
      source: 'registry',
      registryUrl: 'test_registry_url',
      registryProjectId: 'test_registry_project_id',
      registryToken: 'test_registry_token'
    })

    sinon.assert.calledOnce(packageEvaluateStub)
    sinon.assert.calledOnce(packageGetStreamStub)
    sinon.assert.calledOnce(registryPublishStub)
  })

  it('Test publish package to cortex', async() => {
    const packageZipTree = new ZipTree(path.resolve(__dirname, 'test_pkg'), { fs }),
          packageZipStream = await packageZipTree.compress(),
          packageEvaluateStub = sandbox.stub(Package.prototype, 'evaluate').resolves(),
          packageGetStreamStub = sandbox.stub(Package.prototype, 'getPackageStream').resolves(packageZipStream),
          cortexPublishStub = sandbox.stub(Cortex.prototype, 'publishPackage').resolves(),
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

    await publishPkg('TestPackage', { source: 'cortex', client })

    sinon.assert.calledOnce(packageEvaluateStub)
    sinon.assert.calledOnce(packageGetStreamStub)
    sinon.assert.calledOnce(cortexPublishStub)
  })

})
