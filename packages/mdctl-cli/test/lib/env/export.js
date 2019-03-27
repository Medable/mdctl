/* eslint-disable import/no-extraneous-dependencies */
const { assert } = require('chai'),
      fs = require('fs'),
      path = require('path'),
      glob = require('glob'),
      rimraf = require('rimraf'),
      ExportConsoleAdapter = require('@medable/mdctl-export-adapter-console'),
      { Client } = require('@medable/mdctl-api'),
      exportEnv = require('../../../lib/env/export')

describe('Environment Export', () => {

  let blob,
      streamedBlob = null

  beforeEach(() => {
    blob = fs.createReadStream(`${__dirname}/data/blob.ndjson`)
    streamedBlob = fs.createReadStream(`${__dirname}/data/blob_with_streams.ndjson`)
  })

  afterEach(() => {
    blob = null
    streamedBlob = null
  })

  it('export using file adapter with default layout', async() => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
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
    return exportEnv({
      client,
      stream: blob,
      dir: tempDir,
      format: 'yaml'
    }).then(() => new Promise((resolve, reject) => {
      glob('**/*.{yaml,js,png,jpeg,ico,gif,html,txt}', { cwd: tempDir }, (err, files) => {
        rimraf.sync(tempDir)
        if (err) {
          return reject(err)
        }
        assert(files.length === 119, 'there are some missing files created')
        return resolve()
      })
    })).catch((e) => {
      rimraf.sync(tempDir)
      return e
    })
  })

  it('export using streamIds for assets', async() => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
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
    return exportEnv({
      client,
      stream: streamedBlob,
      dir: tempDir,
      format: 'yaml'
    }).then(() => new Promise((resolve, reject) => {
      glob('**/*.{yaml,js,png,jpeg,ico,gif,html,txt}', { cwd: tempDir }, (err, files) => {
        rimraf.sync(tempDir)
        if (err) {
          return reject(err)
        }
        assert(files.length === 120, 'there are some missing files created')
        return resolve()
      })
    })).catch((e) => {
      rimraf.sync(tempDir)
      return e
    })
  })

  it('export using console adapter', async() => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
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
          }),
          adapter = new ExportConsoleAdapter({ print: false })

    return exportEnv({
      client,
      adapter,
      stream: streamedBlob,
      dir: tempDir,
      format: 'yaml'
    }).then(stream => new Promise((resolve) => {
      assert(stream.items.length === 68, 'there are some missing objects created')
      resolve()
    })).catch((e) => {
      rimraf.sync(tempDir)
      return Promise.reject(e)
    })
  })

})
