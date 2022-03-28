const sinon = require('sinon'),
      path = require('path'),
      fs = require('fs'),
      { RegistrySource } = require('../lib/index'),
      ZipTree = require('../lib/zip_tree')

describe('Registry Source Test', () => {

  let rs,
      sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    rs = new RegistrySource('TestPackage', 'latest', {
      registryUrl: 'https://registry.com',
      registryProjectId: '100',
      registryToken: 'test_token'
    })
  })

  afterEach(() => {
    rs = null
    sandbox.restore()
  })

  it('Test registry load package info', async() => {
    // eslint-disable-next-line global-require,import/no-dynamic-require
    const packageJson = require(path.resolve(__dirname, 'test_pkg', 'package.json')),
          readConfigFilesStub = sandbox.stub(rs, 'readConfigFiles').resolves(packageJson)

    await rs.loadPackageInfo()

    sinon.assert.calledOnce(readConfigFilesStub)
    sinon.assert.match(rs.name, 'TestPackage')
    sinon.assert.match(rs.version, '1.0.5')
    sinon.assert.match(rs.engines, {
      cortex: '> 2.15.8'
    })
    sinon.assert.match(rs.dependencies, {
      axon: 'git+https://gitlab.medable.com/axon/org.git#test_pkg',
      'data-transfers': 'git+https://gitlab.medable.com/platform/environments/data-transfers.git#test_pkg'
    })
  })

  it('Test registry get package stream', async() => {
    const packageZipTree = new ZipTree(path.resolve(__dirname, 'test_pkg'), { fs }),
          packageZipStream = await packageZipTree.compress(),
          getStreamStub = sandbox.stub(rs, 'getStream').resolves(packageZipStream),
          // eslint-disable-next-line global-require,import/no-dynamic-require
          getPackageJsonStub = sandbox.stub(rs, 'getPackageJson').resolves(require(path.resolve(__dirname, 'test_pkg', 'package.json'))),
          zipStream = await rs.getStream(),
          packageJson = await rs.getPackageJson(zipStream)

    sinon.assert.calledOnce(getStreamStub)
    sinon.assert.calledOnce(getPackageJsonStub)
    sinon.assert.match(packageJson.name, 'TestPackage')
    sinon.assert.match(packageJson.version, '1.0.5')
    sinon.assert.match(packageJson.engines, {
      cortex: '> 2.15.8'
    })
    sinon.assert.match(packageJson.dependencies, {
      axon: 'git+https://gitlab.medable.com/axon/org.git#test_pkg',
      'data-transfers': 'git+https://gitlab.medable.com/platform/environments/data-transfers.git#test_pkg'
    })
  })

})
