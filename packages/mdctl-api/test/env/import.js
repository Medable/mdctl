/* eslint-disable import/no-extraneous-dependencies */
const { assert } = require('chai'),
      fs = require('fs'),
      path = require('path'),
      zlib = require('zlib'),
      rimraf = require('rimraf'),
      _ = require('lodash'),
      { Client } = require('../../'),
      Environment = require('../../env')

describe('Environment Import', () => {

  let blob

  beforeEach(() => {
    blob = fs.createReadStream(`${__dirname}/data/blob.ndjson`)
  })

  afterEach(() => {
    blob = null
  })

  it('testing import adapter', async() => {

    const tempDir = path.join(__dirname, `output-for-import-${new Date().getTime()}`),
          client = new Client({
            strictSSL: false,
            environment: {
              endpoint: 'https://localhost',
              env: 'dev'
            },
            credentials: {
              type: 'password',
              apiKey: 'abcdefghijklmnopqrstuv',
              username: 'test@medable.com',
              password: 'password'
            }
          })
    /* eslint-disable one-var */
    return Environment.export({
      client,
      stream: blob,
      dir: tempDir,
      format: 'yaml'
    }).then(() => {
      if (fs.existsSync(`${tempDir}/env/assets/env.logo.content.jpeg`)) {
        const exportedFile = fs.createReadStream(`${__dirname}/data/medable.jpg`),
              items = []
        exportedFile.pipe(fs.createWriteStream(`${tempDir}/env/assets/env.logo.content.jpeg`))
        return Environment.import({
          client,
          gzip: true,
          dryRun: true,
          dir: tempDir,
          format: 'yaml',
          progress: (line) => {
            items.push(line)
          }
        }).then(() => {
          rimraf.sync(tempDir)
          return new Promise((resolve, reject) => {
            zlib.unzip(Buffer.concat(items), (err, dezipped) => {
              if (err) {
                return reject(err)
              }
              const result = _.filter(dezipped.toString().split('\n'), i => i !== ''),
                    loadedItems = _.map(result, i => JSON.parse(i)),
                    blobItems = _.groupBy(_.filter(loadedItems, i => i.data && i.streamId), 'streamId'),
                    otherItems = _.filter(loadedItems, i => !i.data && !i.streamId)
              assert(otherItems.length === 38, 'there are more/less files than loaded')
              assert(Object.keys(blobItems).length === 3, 'there are more/less blob items than loaded')
              return resolve()
            })
          })
        }).catch((e) => {
          rimraf.sync(tempDir)
          return Promise.reject(e)
        })
      }
      return Promise.reject(new Error('Exported files not found'))
    }).catch((e) => {
      rimraf.sync(tempDir)
      return Promise.reject(e)
    })
  })
})
