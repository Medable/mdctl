const fs = require('fs'),
      path = require('path'),
      os = require('os'),
      createHash = require('create-hash')

const STATE_VERSION = 1,
      LOCK_STALE_MS = 30 * 1000,
      LOCK_RETRY_MS = 50,
      LOCK_TIMEOUT_MS = 10 * 1000

function md5(buf) {
  const hash = createHash('md5')
  hash.update(buf)
  return hash.digest('hex')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function emptyState(keyCheck) {
  return {
    version: STATE_VERSION,
    keyCheck,
    credentials: []
  }
}

// File-backed credentials store. Data shape on disk:
//   {
//     "version": 1,
//     "keyCheck": "<sha256 hex of encryption key>",
//     "credentials": [
//       { "type": "service", "service": "...", "account": "...",
//         "password": { "iv": "...", "data": "..." } },
//       ...
//     ]
//   }
//
// All `password` payloads are stored encrypted (AES-256-CBC, see
// EncryptionTransformer). The store itself never sees plaintext: callers
// pass the already-encrypted blob in via `set` and read the encrypted
// blob back via `get`/`list`. Decryption happens one layer up.
class FileStore {

  constructor(filePath) {
    this.path = filePath
    this.tmpPath = `${filePath}.tmp`
    this.lockPath = `${filePath}.lock`
    this.state = null
  }

  exists() {
    try {
      fs.accessSync(this.path, fs.constants.R_OK)
      return true
    } catch (e) {
      return false
    }
  }

  // Initialise from disk (or create empty). Verifies the supplied
  // keyCheck matches the stored one when the file already exists.
  // Throws if the keyCheck does not match.
  load(keyCheck) {

    if (!this.exists()) {
      this.state = emptyState(keyCheck)
      return
    }

    const raw = fs.readFileSync(this.path, 'utf8')

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      const e = new Error(`Credentials store at ${this.path} is corrupt and cannot be parsed: ${err.message}`)
      e.code = 'ECREDSCORRUPT'
      throw e
    }

    if (!parsed || typeof parsed !== 'object'
        || !Array.isArray(parsed.credentials)
        || typeof parsed.keyCheck !== 'string') {
      const e = new Error(`Credentials store at ${this.path} has an unrecognised shape.`)
      e.code = 'ECREDSCORRUPT'
      throw e
    }

    if (parsed.keyCheck !== keyCheck) {
      const e = new Error('The encryption key used for this provider doesn\'t match.')
      e.code = 'ECREDSKEYMISMATCH'
      throw e
    }

    this.state = {
      version: parsed.version || STATE_VERSION,
      keyCheck: parsed.keyCheck,
      credentials: parsed.credentials
    }

  }

  // Replace the in-memory state wholesale and persist atomically. Used
  // by the legacy migration path; not for normal mutations.
  setStateAndPersist(state) {
    this.state = state
    this.persist()
  }

  // Atomic write. Writes to a tmp file in the same directory, fsyncs,
  // then renames over the target. fs.rename is atomic on POSIX, and on
  // Windows (Node 16+) MoveFileEx with MOVEFILE_REPLACE_EXISTING is used.
  persist() {
    const dir = path.dirname(this.path)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const json = JSON.stringify(this.state, null, 2),
          fd = fs.openSync(this.tmpPath, 'w', 0o600)
    try {
      fs.writeSync(fd, json)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }

    fs.renameSync(this.tmpPath, this.path)
  }

  list(service) {
    return this.state.credentials
      .filter(c => c.type === 'service' && c.service === service)
      .map(c => ({
        _id: c._id || md5(`${c.service}${c.account}`),
        type: c.type,
        service: c.service,
        account: c.account,
        password: c.password
      }))
  }

  upsert(service, account, encryptedPassword) {
    const existingIdx = this.state.credentials.findIndex(
      c => c.type === 'service' && c.service === service && c.account === account
    )

    const row = {
      _id: md5(`${service}${account}`),
      type: 'service',
      service,
      account,
      password: encryptedPassword
    }

    if (existingIdx >= 0) {
      this.state.credentials[existingIdx] = row
    } else {
      this.state.credentials.push(row)
    }

    this.persist()
  }

  remove(service, account) {
    const before = this.state.credentials.length
    this.state.credentials = this.state.credentials.filter(
      c => !(c.type === 'service' && c.service === service && c.account === account)
    )
    if (this.state.credentials.length === before) {
      return false
    }
    this.persist()
    return true
  }

  // mkdir-based exclusive lock. mkdir is atomic across all POSIX and NTFS
  // filesystems, so two concurrent processes calling this will only ever
  // see exactly one succeed. Released by removing the directory; stale
  // locks (older than LOCK_STALE_MS) are reclaimed automatically.
  async acquireLock() {
    const start = Date.now()
    while (true) { // eslint-disable-line no-constant-condition
      try {
        fs.mkdirSync(this.lockPath)
        // record holder for diagnostics; failure to write metadata is
        // non-fatal because lock ownership is established by mkdir alone.
        try {
          fs.writeFileSync(
            path.join(this.lockPath, 'owner'),
            JSON.stringify({ pid: process.pid, host: os.hostname(), at: new Date().toISOString() })
          )
        } catch (e) { /* ignore */ }
        return
      } catch (err) {
        if (err.code !== 'EEXIST') {
          throw err
        }
        // Lock exists. Check age and try to reclaim if stale.
        try {
          const stat = fs.statSync(this.lockPath)
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            this.releaseLock()
            continue // retry mkdir immediately
          }
        } catch (statErr) { /* lock vanished between checks; retry */ }

        if (Date.now() - start > LOCK_TIMEOUT_MS) {
          const e = new Error(`Timed out acquiring credentials store lock at ${this.lockPath}`)
          e.code = 'ECREDSLOCKED'
          throw e
        }
        await sleep(LOCK_RETRY_MS)
      }
    }
  }

  releaseLock() {
    try {
      try { fs.unlinkSync(path.join(this.lockPath, 'owner')) } catch (e) { /* ignore */ }
      fs.rmdirSync(this.lockPath)
    } catch (e) { /* ignore */ }
  }

  async withLock(fn) {
    await this.acquireLock()
    try {
      return await fn()
    } finally {
      this.releaseLock()
    }
  }

}

module.exports = {
  FileStore,
  STATE_VERSION,
  emptyState,
  md5
}
