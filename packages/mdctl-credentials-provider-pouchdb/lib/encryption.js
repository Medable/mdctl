const {
        createCipheriv, createDecipheriv, listCiphers
      } = require('browserify-aes'),
      cipherModes = require('browserify-aes/modes'),
      createHash = require('create-hash'),
      randomBytes = require('randombytes'),
      { isSet, rString } = require('@medable/mdctl-core-utils/values'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Fault } = require('@medable/mdctl-core')

function sha256(buf) {
  const hash = createHash('sha256')
  hash.update(buf)
  return hash.digest('hex')
}

// Encryption format and on-disk shape are kept byte-compatible with the
// previous PouchDB-backed implementation so legacy stores can be migrated
// without re-encrypting any payloads.
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
      throw Fault.create('kInvalidArgument', { reason: `Invalid key length. Expected ${cipherModes[cipher].key} key but got ${key.length * 8}` })
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

}

module.exports = {
  EncryptionTransformer,
  sha256
}
