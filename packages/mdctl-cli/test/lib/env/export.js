/* eslint-disable import/no-extraneous-dependencies */
const { assert } = require('chai'),
      fs = require('fs'),
      path = require('path'),
      glob = require('glob'),
      rimraf = require('rimraf'),
      ndjson = require('ndjson'),
      ExportConsoleAdapter = require('@medable/mdctl-export-adapter-console'),
      { Client } = require('@medable/mdctl-api'),
      exportEnv = require('../../../lib/env/export')

// New Helper added here
const makeClient = () => ({
  environment: {
    url: 'https://localhost',
    endpoint: 'localhost',
    env: 'test'
  }
})

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

          fs.mkdirSync(tempDir, { recursive: true })

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

// New Test Section added here
describe('Environment Export -- manifest option', () => {

  let tempDir, manifestContent, capturedBody

  beforeEach(() => {
    tempDir = path.join(process.cwd(), `output-manifest-test-${new Date().getTime()}`)
    manifestContent = { scripts: { includes: ['*'] } }
    capturedBody = null
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    rimraf.sync(tempDir)
  })

  const makeCallMock = () => async(pathname, opts) => {
    capturedBody = opts.body
    opts.stream.write(JSON.stringify({ object: 'manifest-exports' }) + '\n')
    opts.stream.end()
  }

  it('resolves an absolute --manifest path and sends parsed object to API', async() => {
    const manifestFile = path.join(tempDir, 'my-manifest.json')
    fs.writeFileSync(manifestFile, JSON.stringify(manifestContent))

    const client = { ...makeClient(), call: makeCallMock() }

    await exportEnv({ client, dir: tempDir, manifest: manifestFile, format: 'json' })

    assert.deepEqual(capturedBody.manifest, manifestContent,
      '--manifest absolute path should be parsed and sent as object, not as a string')
  })

  it('expands ~ in --manifest path to the home directory', async() => {
    const os = require('os')
    const manifestFile = path.join(tempDir, 'tilde-manifest.json')
    fs.writeFileSync(manifestFile, JSON.stringify(manifestContent))

    const relativeToCwd = path.relative(os.homedir(), manifestFile)
    const tildeManifest = `~/${relativeToCwd}`

    const client = { ...makeClient(), call: makeCallMock() }

    await exportEnv({ client, dir: tempDir, manifest: tildeManifest, format: 'json' })

    assert.deepEqual(capturedBody.manifest, manifestContent,
      '--manifest with ~ should be expanded to the home directory')
  })

  it('resolves a relative --manifest path against the output dir', async() => {
    const manifestFile = path.join(tempDir, 'custom-manifest.json')
    fs.writeFileSync(manifestFile, JSON.stringify(manifestContent))

    const client = { ...makeClient(), call: makeCallMock() }

    await exportEnv({ client, dir: tempDir, manifest: 'custom-manifest.json', format: 'json' })

    assert.deepEqual(capturedBody.manifest, manifestContent,
      '--manifest relative path should be resolved against outputDir and parsed')
  })

  it('sends ec__ objects manifest with env includes and 7 named objects', async() => {
    const sampleManifest = {
      env: { includes: ['*'] },
      object: 'manifest',
      objects: [
        { includes: ['*'], name: 'ec__default_document_css' },
        { includes: ['*'], name: 'ec__document_datum' },
        { includes: ['*'], name: 'ec__document_invite' },
        { includes: ['*'], name: 'ec__document_template' },
        { includes: ['*'], name: 'ec__knowledge_check' },
        { includes: ['*'], name: 'ec__linked_field' },
        { includes: ['*'], name: 'ec__signed_document' }
      ]
    }
    const manifestFile = path.join(tempDir, 'manifest.json')
    fs.writeFileSync(manifestFile, JSON.stringify(sampleManifest))

    const client = { ...makeClient(), call: makeCallMock() }

    await exportEnv({ client, dir: tempDir, format: 'json' })

    assert.deepEqual(capturedBody.manifest, sampleManifest,
      'manifest with ec__ objects should be auto-discovered and sent as parsed object')
    assert.strictEqual(capturedBody.manifest.object, 'manifest')
    assert.strictEqual(capturedBody.manifest.objects.length, 7)
    assert.isTrue(
      capturedBody.manifest.objects.every(o => o.includes[0] === '*'),
      'all objects should have wildcard includes'
    )
  })

})