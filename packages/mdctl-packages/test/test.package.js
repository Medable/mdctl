/* eslint-disable import/no-extraneous-dependencies */
const Package = require('../index')

describe('CLI - Pkg - Install package', () => {


  it('test package', async() => {
    const pkg = new Package({

      name: 'my-study-1022992',
      version: '1.0.0-rc.1',
      engines: {
        cortex: '>=2.16 <2.17'
      },
      scripts: {},
      manifest: 'manifest.json',
      dependencies: {
        'data-transfers': 'git+https://gitlab.medable.com/platform/environments/data-transfers.git#test_pkg',
        axon: 'file:///Users/gastonrobledo/Projects/medable/orgs/axon'
      }


    }, {
      token: 'tijBHzajwYrpz4MBVw2G'
    })
    await pkg.install()
  })


})
