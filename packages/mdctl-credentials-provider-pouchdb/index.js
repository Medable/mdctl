const { isSet, rString } = require('@medable/mdctl-core-utils/values'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { CredentialsProvider } = require('@medable/mdctl-core/credentials/provider'),
      { Fault } = require('@medable/mdctl-core'),
      { EncryptionTransformer } = require('./lib/encryption'),
      { FileStore } = require('./lib/store'),
      { migrate, looksLikeLegacySqlite } = require('./lib/migrate')

let deprecationWarned = false

function warnDeprecated() {
  if (deprecationWarned) return
  deprecationWarned = true
  if (process.env.MDCTL_SUPPRESS_POUCHDB_DEPRECATION) return
  process.emitWarning(
    '@medable/mdctl-credentials-provider-pouchdb is deprecated. The package '
    + 'now stores credentials in a JSON file (PouchDB has been removed) and '
    + 'will be renamed to @medable/mdctl-credentials-provider-file in a '
    + 'future release. The exported class name and API remain unchanged.',
    'DeprecationWarning',
    'MDCTL_DEP_POUCHDB_PROVIDER'
  )
}

// Drop-in replacement for the previous PouchDB-backed credentials
// provider. Constructor signature is unchanged: `{ name, key }`.
//
// `name` is interpreted as it was before: an absolute file path. The
// new JSON store lives at `<name>.json`. If a legacy SQLite file is
// found at `<name>` (the previous adapter's database file), it is
// migrated on first use; the legacy file is renamed to
// `<name>.legacy-<timestamp>` afterwards but never deleted.
class PouchDbCredentialsProvider extends CredentialsProvider {

  constructor(input) {

    super()
    warnDeprecated()

    const options = isSet(input) ? input : {},
          name = rString(options.name, ''),
          { key } = options

    if (!name) {
      throw Fault.create('kInvalidArgument', { reason: '`name` is required (path to credentials store).' })
    }

    const encryption = new EncryptionTransformer({ key }),
          store = new FileStore(`${name}.json`),
          legacyPath = name

    Object.assign(privatesAccessor(this), {
      encryption,
      store,
      legacyPath,
      initializing: false,
      initPromise: null
    })

  }

  async initialize() {

    const privates = privatesAccessor(this)

    // Re-entrant: a second concurrent call awaits the first.
    if (privates.initPromise) {
      return privates.initPromise
    }

    if (privates.initialized) return true

    privates.initPromise = (async() => {
      const { store, encryption, legacyPath } = privates

      await store.withLock(async() => {

        // Already initialised by another in-process caller while we waited
        // for the lock.
        if (privates.initialized) return

        if (store.exists()) {
          // Existing JSON store: just load and verify keyCheck.
          store.load(encryption.keyCheck)
        } else if (looksLikeLegacySqlite(legacyPath)) {
          // No JSON store yet but a legacy SQLite file is present.
          // Migrate it.
          migrate({ legacyPath, store, encryption })
        } else {
          // Fresh install. Create an empty store with the keyCheck
          // recorded so a later wrong-key attempt is detected.
          store.load(encryption.keyCheck) // load() seeds empty state
          store.persist()
        }
      })

      privates.initialized = true
    })()

    try {
      await privates.initPromise
    } finally {
      privates.initPromise = null
    }

    return true
  }

  async getCredentials(service) {
    await this.initialize()
    const { store, encryption } = privatesAccessor(this)
    return store.list(service).map(row => ({
      _id: row._id,
      type: row.type,
      service: row.service,
      account: row.account,
      password: encryption.decrypt(row.password)
    }))
  }

  async setCredentials(service, account, password) {
    await this.initialize()
    const { store, encryption } = privatesAccessor(this)
    await store.withLock(async() => {
      // Re-load before mutating so we don't clobber writes made by
      // another process while we were idle.
      store.load(encryption.keyCheck)
      store.upsert(service, account, encryption.encrypt(password))
    })
  }

  async deleteCredentials(service, account) {
    await this.initialize()
    const { store, encryption } = privatesAccessor(this)
    let removed = false
    await store.withLock(async() => {
      store.load(encryption.keyCheck)
      removed = store.remove(service, account)
    })
    return removed
  }

  async close() {
    const privates = privatesAccessor(this)
    privates.initialized = false
    return true
  }

}

module.exports = PouchDbCredentialsProvider
