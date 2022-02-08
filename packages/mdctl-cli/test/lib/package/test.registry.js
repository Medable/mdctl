// eslint-disable-next-line import/no-extraneous-dependencies
const sinon = require('sinon'),
      path = require('path'),
      fs = require('fs'),
      ZipTree = require('../../../../mdctl-packages/lib/zip_tree'),
      { RegistrySource } = require('../../../../mdctl-packages/lib'),
      { Registry } = require('../../../lib/package/source')

describe('Registry Test', () => {

  let registry,
      sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    registry = new Registry('TestPackage', 'latest', {
      registryUrl: 'http://registry.com',
      registryProjectId: '100',
      registryToken: 'test_token'
    })
  })

  afterEach(() => {
    registry = null
    sandbox.restore()
  })

  it('Test publish package to registry', async() => {
    const packageZipTree = new ZipTree(path.resolve(__dirname, 'test_pkg'), { fs }),
          packageZipStream = await packageZipTree.compress(),
          publishPackageStub = sandbox.stub(RegistrySource.prototype, 'publishPackage').resolves({})

    await registry.publishPackage(packageZipStream)

    sinon.assert.calledOnce(publishPackageStub)
  })

})
