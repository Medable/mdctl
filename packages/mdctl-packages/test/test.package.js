/* eslint-disable import/no-extraneous-dependencies */
const Package = require('../index'),
      fs = require('fs'),
      path = require('path'),
      ndjson = require('ndjson')

describe('CLI - Pkg - Install package', () => {

  it('test git package source', async() => {
    const p = new Package('', '.')
    const pkg = new Package(
      'my-study-1022992',
      'git+https://gitlab.medable.com/platform/environments/data-transfers.git#test_pkg',
      null,
      {
        dependencies: {},
        token: 'ph_UVi__jayWH4p7w3Qi'
      }
    )

    const d = await pkg.evaluate(),
          pFile = fs.createWriteStream(`./${d.name}-${d.version}.zip`),
          pStream = await d.getPackageStream()
    pStream.pipe(pFile)
    console.log(`${d}`)

    console.log('\nDependencies: \n')
    for(const p of d.dependenciesPackages) {
      const pdFile = fs.createWriteStream(`./${p.name}-${p.version}.zip`),
            s = await p.getPackageStream()
      s.pipe(pdFile)
      console.log(`${p}`)
    }
    // const result = await pkg.evaluate()
    // const stream = await result.dependantPkgs[0].getStream()
    // stream.on('data', (chunk) => {
    //   console.log(chunk)
    // })
    // stream.resume()
  })

  it('test package', async() => {
    const pkg = new Package('my-study-1022992',{
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
      token: 'ph_UVi__jayWH4p7w3Qi'
    })

    await pkg.install()
    // const result = await pkg.evaluate()
    // const stream = await result.dependantPkgs[0].getStream()
    // stream.on('data', (chunk) => {
    //   console.log(chunk)
    // })
    // stream.resume()
  })

  it('test package export', async() => {
    const stream = fs.createReadStream(path.resolve('data.ndjson'))
    const pkg = new Package('exported','1.0.0-rc.1', {
      ndjsonStream: stream.pipe(ndjson.stringify())
    })

    const data = await pkg.evaluate()
    console.log(data)
    // const result = await pkg.evaluate()
    // const stream = await result.dependantPkgs[0].getStream()
    // stream.on('data', (chunk) => {
    //   console.log(chunk)
    // })
    // stream.resume()
  })

})
