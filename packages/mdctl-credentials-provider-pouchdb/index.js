const PouchDB = require('pouchdb-core')
        .plugin(require('pouchdb-adapter-node-websql'))
        .plugin(require('pouchdb-find'))
        .plugin(require('transform-pouch')),
      async = require('async'),
      {
        createCipheriv, createDecipheriv, listCiphers
      } = require('browserify-aes'),
      createHash = require('create-hash'),
      randomBytes = require('randombytes'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { isSet, rString, rPath } = require('@medable/mdctl-core-utils/values'),
      { CredentialsProvider } = require('@medable/mdctl-core/credentials/provider'),
      { Fault } = require('@medable/mdctl-core')

class EncryptionTransformer {

  constructor(input) {

    const options = isSet(input) ? input : {},
          cipher = 'aes-256-cbc',
          key = Buffer.from(rString(options.key, '')),
          ciphers = listCiphers()

    if (!ciphers.includes(cipher)) {
      throw Fault.create('kInvalidArgument', { reason: `Invalid cipher "${cipher}"` })
    }

    if ((key.length * 8) !== 256) {
      throw Fault.create('kInvalidArgument', { reason: `Invalid key length. Expected ${ciphers[cipher].key} but  got ${key.length * 8}` })
    }

    Object.assign(
      privatesAccessor(this), {
        key,
        keyCheck: sha256(key),
        cipher
      }
    )

  }

  get keyCheck() {
    return privatesAccessor(this).keyCheck
  }

  encrypt(data) {
    const privates = privatesAccessor(this),
          { cipher, key } = privates,
          iv = randomBytes(16),
          encipher = createCipheriv(cipher, key, iv),
          encrypted = encipher.update(data)

    return {
      iv: iv.toString('hex'),
      data: Buffer.concat([encrypted, encipher.final()]).toString('hex')
    }
  }

  decrypt(doc) {
    const privates = privatesAccessor(this),
          { cipher, key } = privates,
          { iv, data } = doc || {},
          decipher = createDecipheriv(cipher, key, Buffer.from(iv, 'hex')),
          decrypted = decipher.update(Buffer.from(data, 'hex'))

    return Buffer.concat([decrypted, decipher.final()]).toString()
  }

  incoming(doc) {
    if (doc.password) {
      doc.password = this.encrypt(doc.password) // eslint-disable-line no-param-reassign
    }
    return doc
  }

  outgoing(doc) {
    if (doc.password) {
      doc.password = this.decrypt(doc.password) // eslint-disable-line no-param-reassign
    }
    return doc
  }

}

class PouchDbCredentialsProvider extends CredentialsProvider {

  /**
   *
   * @param input
   *  name: database name
   *  key: encryption key
   */
  constructor(input) {

    super()

    const options = isSet(input) ? input : {},
          { name, key } = options,
          encryption = new EncryptionTransformer({ key }),
          privates = privatesAccessor(this)

    Object.assign(privates, {
      encryption,
      name,
      initializing: false
    })

  }

  async initialize() {

    const privates = privatesAccessor(this),
          { name, encryption } = privates,
          { keyCheck } = encryption

    let { db } = privates

    if (!db) {

      // make this re-entrant
      if (privates.initializing) {
        return new Promise((resolve, reject) => {
          async.whilst(
            () => privates.initializing,
            async() => sleep(10),
            () => (privates.err ? reject(privates.err) : resolve())
          )
        })
      }

      privates.initializing = true

      let err

      try {

        db = new PouchDB(name, { adapter: 'websql', auto_compaction: true, revs_limit: 0 })

        db.transform(encryption)

        await db.createIndex({
          index: { fields: ['type', 'service', 'account'] }
        })

        const config = rPath(await db.find({
          selector: { type: 'config' }
        }), 'docs.0')

        if (config && config.keyCheck !== keyCheck) {
          err = Fault.create('kInvalidArgument', { reason: 'The encryption key used for this provider doesn\'t match.' })
        } else if (!config) {
          await db.put({
            _id: 'config',
            type: 'config',
            keyCheck
          })
        }
      } catch (e) {
        err = e
      }

      privates.db = db
      privates.initializing = false
      if (err) {
        privates.err = err
        throw err
      }

    }

    return true

  }

  async getCredentials(service) {

    await this.initialize()

    const { db } = privatesAccessor(this),
          { docs } = await db.find({
            selector: {
              type: 'service',
              service
            }
          })

    return docs
  }

  async setCredentials(service, account, password) {

    await this.initialize()

    const { db } = privatesAccessor(this),
          doc = rPath(await db.find({
            selector: {
              type: 'service',
              service,
              account
            },
            fields: ['_id', '_rev']
          }), 'docs.0'),
          { _id, _rev } = doc || {}

    await db.put({
      _id: _id || md5(`${service}${account}`),
      _rev,
      type: 'service',
      service,
      account,
      password
    })

  }

  async deleteCredentials(service, account) {

    await this.initialize()

    const { db } = privatesAccessor(this),
          doc = rPath(await db.find({
            selector: {
              type: 'service',
              service,
              account
            },
            fields: ['_id', '_rev']
          }), 'docs.0'),
          { _id, _rev } = doc || {}

    if (!doc) {
      return false
    }
    await db.remove({ _id, _rev })

    return true
  }

  async close() {

    const privates = privatesAccessor(this)
    if (privates.db) {
      await privates.db.close()
      privates.db = null
    }
    return true

  }

}

function md5(buf) {
  const hash = createHash('md5')
  hash.update(buf)
  return hash.digest('hex')
}

function sha256(buf) {
  const hash = createHash('sha256')
  hash.update(buf)
  return hash.digest('hex')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = PouchDbCredentialsProvider
