/* eslint-disable one-var */
const path = require('path'),
      fs = require('fs'),
      ImportFileTreeAdapter = require('../../index')


describe('#Import adapter', () => {
  // eslint-disable-next-line no-undef
  beforeAll(async() => {
    fs.copyFileSync(path.join(__dirname, '../../../mdctl-axon-tools/packageScripts/ingestTransform.js'), path.join(__dirname, 'template-export/ingestTransform.js'))

  })
  let fileAdapter

  it('#should retrieve ingest transform', async() => {
    fileAdapter = new ImportFileTreeAdapter(path.join(__dirname, 'template-export'), 'json')

    const iter = fileAdapter.iterator[Symbol.asyncIterator]()
    let item = await iter.next(),
        ingestTransform
    while (!item.done) {
      if (item.value.object === 'package' && item.value.pipes.ingest) {
        ingestTransform = item.value.pipes.ingest
      }
      // eslint-disable-next-line no-await-in-loop
      item = await iter.next()
    }
    expect(fs.readFileSync(path.join(__dirname, 'template-export/ingestTransform.js')).toString('utf8')).toEqual(ingestTransform)
  })

})
