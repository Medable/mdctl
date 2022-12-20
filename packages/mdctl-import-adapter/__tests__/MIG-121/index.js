/* eslint-disable one-var */
const path = require('path'),
      fs = require('fs'),
      ImportFileTreeAdapter = require('../../index')


describe('#Import adapter', () => {
  beforeAll(async() => {
    fs.copyFileSync(path.join(__dirname, '../../../mdctl-axon-tools/packageScripts/ingestTransform.js'), path.join(__dirname, 'template-export/ingestTransform.js'))

  })
  let fileAdapter,
      preserveTemplateStatus

  it('#preserveTemplateStatus is set to false -> #should retrieve ingest transform as is', async() => {
    preserveTemplateStatus = false
    fileAdapter = new ImportFileTreeAdapter(
      path.join(__dirname, 'template-export'),
      'json',
      null,
      null,
      preserveTemplateStatus
    )

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

  it('#preserveTemplateStatus param is passed -> #should retrieve ingest transform as is', async() => {
    preserveTemplateStatus = false
    fileAdapter = new ImportFileTreeAdapter(
      path.join(__dirname, 'template-export'),
      'json',
      null,
      null
    )

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

  it('#preserveTemplateStatus param is set to "true" -> #should prepend constant declaration (const preserveTemplateStatus=true) to ingest transform', async() => {
    preserveTemplateStatus = true
    fileAdapter = new ImportFileTreeAdapter(
      path.join(__dirname, 'template-export'),
      'json',
      null,
      null,
      preserveTemplateStatus
    )

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
    const ingestTransformFileContent = fs.readFileSync(path.join(__dirname, 'template-export/ingestTransform.js')).toString('utf8')
    expect(`const preserveTemplateStatus = true\n${ingestTransformFileContent}`).toEqual(ingestTransform)
  })

})
