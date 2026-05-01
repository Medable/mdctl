const fs = require('fs'),
      path = require('path'),
      { STATE_VERSION, md5 } = require('./store')

// Returns true when a legacy PouchDB-WebSQL store appears to exist at
// `legacyPath`. We use the SQLite magic header to be sure rather than
// just checking for file existence.
function looksLikeLegacySqlite(legacyPath) {
  let fd
  try {
    fd = fs.openSync(legacyPath, 'r')
  } catch (e) {
    return false
  }
  try {
    const header = Buffer.alloc(16)
    const read = fs.readSync(fd, header, 0, 16, 0)
    if (read < 16) return false
    // "SQLite format 3\u0000"
    return header.toString('utf8', 0, 15) === 'SQLite format 3'
  } finally {
    try { fs.closeSync(fd) } catch (e) { /* ignore */ }
  }
}

// Try to load better-sqlite3. Returned as null if unavailable so callers
// can produce an actionable error (rather than crashing on require).
function tryLoadDriver() {
  try {
    return require('better-sqlite3') // eslint-disable-line global-require
  } catch (e) {
    return null
  }
}

function legacyMissingDriverError(legacyPath) {
  const e = new Error(
    `A legacy credentials database was found at:\n  ${legacyPath}\n\n`
    + 'To migrate it, install better-sqlite3:\n'
    + '  npm install better-sqlite3\n\n'
    + 'If you don\'t need the existing credentials, you can move the legacy '
    + 'file aside (do NOT delete it until you are sure) to start fresh:\n'
    + `  mv "${legacyPath}" "${legacyPath}.disabled"\n`
    + 'and then re-run the command. You will be prompted to log in again.'
  )
  e.code = 'ECREDSDRIVERMISSING'
  return e
}

// Read every winning revision out of the PouchDB-WebSQL document store.
// Returns an array of { id, doc, deleted }.
function readLegacyDocs(db) {
  const stmt = db.prepare(
    'SELECT ds.id AS id, bs.json AS json, bs.deleted AS deleted '
    + 'FROM "document-store" ds '
    + 'JOIN "by-sequence" bs ON ds.winningseq = bs.seq'
  )
  const rows = stmt.all()
  return rows.map(r => ({
    id: r.id,
    deleted: Number(r.deleted) === 1,
    doc: r.json ? JSON.parse(r.json) : null
  }))
}

// Pulls credentials out of legacy docs, skipping tombstones, design
// documents and the config doc. Verifies every encrypted password
// decrypts cleanly with the supplied EncryptionTransformer; if anything
// fails to decrypt the migration is aborted so the source file is not
// touched.
function buildState(legacyDocs, encryption, expectedKeyCheck) {

  const configDoc = legacyDocs.find(r => !r.deleted && r.id === 'config' && r.doc && r.doc.type === 'config')

  if (!configDoc) {
    const e = new Error('Legacy credentials store has no config document; cannot verify encryption key.')
    e.code = 'ECREDSNOCONFIG'
    throw e
  }

  if (configDoc.doc.keyCheck !== expectedKeyCheck) {
    const e = new Error('The encryption key used for this provider doesn\'t match.')
    e.code = 'ECREDSKEYMISMATCH'
    throw e
  }

  const credentials = []

  for (const row of legacyDocs) {
    if (row.deleted) continue
    if (!row.doc) continue
    if (row.id.startsWith('_design/') || row.id.startsWith('_local/')) continue
    if (row.doc.type !== 'service') continue

    const { service, account, password } = row.doc

    if (typeof service !== 'string' || typeof account !== 'string') continue
    if (!password || typeof password !== 'object'
        || typeof password.iv !== 'string' || typeof password.data !== 'string') {
      const e = new Error(
        `Legacy credential at id=${row.id} has an unexpected password shape; refusing to migrate.`
      )
      e.code = 'ECREDSCORRUPT'
      throw e
    }

    // Round-trip the decrypt as a data-integrity smoke test. We discard
    // the plaintext immediately and persist only the encrypted blob.
    try {
      encryption.decrypt(password)
    } catch (err) {
      const e = new Error(
        `Failed to decrypt legacy credential at id=${row.id} during migration: ${err.message}. `
        + 'Migration aborted; the legacy file has not been modified.'
      )
      e.code = 'ECREDSDECRYPT'
      throw e
    }

    credentials.push({
      _id: md5(`${service}${account}`),
      type: 'service',
      service,
      account,
      password
    })
  }

  return {
    version: STATE_VERSION,
    keyCheck: expectedKeyCheck,
    credentials
  }
}

// Sidecar files PouchDB's WebSQL adapter creates for MapReduce indexes,
// e.g. "<name>-mrview-<hash>" plus their journal/wal companions.
function listLegacySidecarFiles(legacyPath) {
  const dir = path.dirname(legacyPath),
        base = path.basename(legacyPath),
        prefix = `${base}-mrview-`

  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch (e) {
    return []
  }
  return entries
    .filter(name => name.startsWith(prefix))
    .map(name => path.join(dir, name))
}

function timestampSuffix() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function writeLegacyReadme(suffix, archivedPaths, originalPath) {
  const readmePath = `${originalPath}.legacy-${suffix}.README.txt`,
        body = [
          'This directory contains a legacy PouchDB/SQLite credentials',
          'store that was migrated to a JSON-backed format.',
          '',
          `Migrated at: ${new Date().toISOString()}`,
          '',
          'Archived files (these were renamed, not deleted):',
          ...archivedPaths.map(p => `  ${p}`),
          '',
          'New store location:',
          `  ${originalPath}.json`,
          '',
          'To roll back to the legacy store:',
          '  1. Stop any running mdctl processes.',
          `  2. Move ${originalPath}.json out of the way (or delete it).`,
          '  3. Rename the archived file back to its original name:',
          `       mv "${originalPath}.legacy-${suffix}" "${originalPath}"`,
          '  4. Reinstall an mdctl version older than the one that performed',
          '     the migration.',
          ''
        ].join('\n')
  try {
    fs.writeFileSync(readmePath, body, { mode: 0o600 })
  } catch (e) { /* readme is best-effort; do not fail migration over it */ }
}

// Migrate a legacy PouchDB/WebSQL credentials database at `legacyPath`
// into the supplied `store`. Caller MUST hold the store lock.
//
// Safety properties:
//   1. Reads the legacy SQLite file in read-only mode.
//   2. Verifies the supplied encryption key matches before doing anything.
//   3. Decrypts every credential as an integrity check before writing.
//   4. Writes the new JSON store atomically (tmp + rename) BEFORE touching
//      the legacy file.
//   5. The legacy file is renamed (with a timestamped suffix), never
//      deleted; sidecar files are renamed alongside it.
//   6. Drops a README next to the archive describing how to roll back.
function migrate({ legacyPath, store, encryption }) {

  const Database = tryLoadDriver()
  if (!Database) throw legacyMissingDriverError(legacyPath)

  let db
  try {
    db = new Database(legacyPath, { readonly: true, fileMustExist: true })
  } catch (err) {
    const e = new Error(`Failed to open legacy credentials store at ${legacyPath}: ${err.message}`)
    e.code = 'ECREDSOPENLEGACY'
    throw e
  }

  let newState
  try {
    const legacyDocs = readLegacyDocs(db)
    newState = buildState(legacyDocs, encryption, encryption.keyCheck)
  } finally {
    try { db.close() } catch (e) { /* ignore */ }
  }

  // 1. Persist the new JSON store atomically. Until this succeeds we
  //    have not modified anything on disk that the legacy adapter cared
  //    about.
  store.setStateAndPersist(newState)

  // 2. Re-read it back and verify it parses and matches keyCheck. If
  //    this fails for any reason we leave the legacy file in place.
  try {
    const verify = JSON.parse(fs.readFileSync(store.path, 'utf8'))
    if (verify.keyCheck !== encryption.keyCheck
        || !Array.isArray(verify.credentials)
        || verify.credentials.length !== newState.credentials.length) {
      throw new Error('post-write verification mismatch')
    }
  } catch (err) {
    const e = new Error(
      `Wrote new credentials store at ${store.path} but verification failed (${err.message}). `
      + 'Legacy file has been left untouched.'
    )
    e.code = 'ECREDSVERIFY'
    throw e
  }

  // 3. Rename (NOT delete) the legacy file and any sidecar files so
  //    that a manual rollback is always possible.
  const suffix = timestampSuffix(),
        archivedLegacy = `${legacyPath}.legacy-${suffix}`,
        sidecarPaths = listLegacySidecarFiles(legacyPath),
        archivedAll = [archivedLegacy]

  fs.renameSync(legacyPath, archivedLegacy)

  for (const sidecar of sidecarPaths) {
    const archived = `${sidecar}.legacy-${suffix}`
    try {
      fs.renameSync(sidecar, archived)
      archivedAll.push(archived)
    } catch (e) { /* sidecars are derived; non-fatal if rename fails */ }
  }

  writeLegacyReadme(suffix, archivedAll, legacyPath)

  return {
    archivedLegacy,
    archivedSidecars: archivedAll.slice(1),
    migratedCount: newState.credentials.length
  }
}

module.exports = {
  migrate,
  looksLikeLegacySqlite,
  // exposed for tests
  buildState,
  readLegacyDocs
}
