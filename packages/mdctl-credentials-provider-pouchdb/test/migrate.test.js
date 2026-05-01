/* eslint-env mocha */

const fs = require('fs'),
      path = require('path'),
      os = require('os'),
      { expect } = require('chai'),
      Database = require('better-sqlite3'),
      PouchDbCredentialsProvider = require('..'),
      { EncryptionTransformer } = require('../lib/encryption')

const KEY = '0123456789abcdef0123456789abcdef'

function tmpName() {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'mdctl-creds-mig-')),
    'mdctl.db'
  )
}

// Build a SQLite file with exactly the schema PouchDB-WebSQL produces
// (verified against a real on-disk legacy store) and seed it with the
// supplied logical documents. Each `doc` is written as the winning
// revision of an `id`.
function writeLegacySqlite(filePath, docs) {
  const db = new Database(filePath)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS 'attach-store' (digest UNIQUE, escaped TINYINT(1), body BLOB);
      CREATE TABLE IF NOT EXISTS 'local-store' (id UNIQUE, rev, json);
      CREATE TABLE IF NOT EXISTS 'attach-seq-store' (digest, seq INTEGER);
      CREATE TABLE IF NOT EXISTS 'document-store' (id unique, json, winningseq, max_seq INTEGER UNIQUE);
      CREATE INDEX IF NOT EXISTS 'attach-seq-seq-idx' ON 'attach-seq-store' (seq);
      CREATE UNIQUE INDEX IF NOT EXISTS 'attach-seq-digest-idx' ON 'attach-seq-store' (digest, seq);
      CREATE INDEX IF NOT EXISTS 'doc-winningseq-idx' ON 'document-store' (winningseq);
      CREATE TABLE IF NOT EXISTS 'by-sequence' (seq INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, json, deleted TINYINT(1), doc_id, rev);
      CREATE INDEX IF NOT EXISTS 'by-seq-deleted-idx' ON 'by-sequence' (seq, deleted);
      CREATE UNIQUE INDEX IF NOT EXISTS 'by-seq-doc-id-rev' ON 'by-sequence' (doc_id, rev);
      CREATE TABLE IF NOT EXISTS 'metadata-store' (dbid, db_version INTEGER);
    `)

    const insertSeq = db.prepare(
      'INSERT INTO "by-sequence" (json, deleted, doc_id, rev) VALUES (?, ?, ?, ?)'
    )
    const insertDoc = db.prepare(
      'INSERT INTO "document-store" (id, json, winningseq, max_seq) VALUES (?, ?, ?, ?)'
    )

    docs.forEach((entry) => {
      const json = JSON.stringify(entry.doc),
            deleted = entry.deleted ? 1 : 0,
            rev = entry.rev || '1-aaaa',
            info = insertSeq.run(json, deleted, entry.id, rev)
      insertDoc.run(entry.id, '{}', info.lastInsertRowid, info.lastInsertRowid)
    })
  } finally {
    db.close()
  }
}

function seedLegacyStore(filePath, key, plaintextRows) {
  const enc = new EncryptionTransformer({ key }),
        docs = []

  docs.push({
    id: 'config',
    doc: { type: 'config', keyCheck: enc.keyCheck }
  })

  plaintextRows.forEach((row, i) => {
    docs.push({
      id: `doc-${i}`,
      doc: {
        type: 'service',
        service: row.service,
        account: row.account,
        password: enc.encrypt(row.password)
      }
    })
  })

  writeLegacySqlite(filePath, docs)
  return docs
}

describe('legacy SQLite migration', () => {

  it('migrates active credentials, skipping deleted, _design, _local, and config docs', async() => {
    const name = tmpName()
    const enc = new EncryptionTransformer({ key: KEY })

    writeLegacySqlite(name, [
      { id: 'config', doc: { type: 'config', keyCheck: enc.keyCheck } },
      { id: 'doc-1', doc: { type: 'service', service: 'password', account: 'a', password: enc.encrypt('p1') } },
      { id: 'doc-2', doc: { type: 'service', service: 'password', account: 'b', password: enc.encrypt('p2') } },
      // a deleted (tombstoned) credential should NOT be migrated
      { id: 'doc-3', deleted: true, doc: { type: 'service', service: 'password', account: 'c', password: enc.encrypt('p3') } },
      // design docs should be ignored
      { id: '_design/idx-x', doc: { language: 'query', views: {} } },
      // _local docs should be ignored
      { id: '_local/checkpoint', doc: { _id: '_local/checkpoint', last_seq: 5 } }
    ])

    const provider = new PouchDbCredentialsProvider({ name, key: KEY })
    const list = await provider.getCredentials('password')

    const accountToPassword = Object.fromEntries(list.map(r => [r.account, r.password]))
    expect(accountToPassword).to.deep.equal({ a: 'p1', b: 'p2' })
  })

  it('renames the legacy file rather than deleting it', async() => {
    const name = tmpName()
    seedLegacyStore(name, KEY, [{ service: 'password', account: 'a', password: 'p1' }])
    const beforeBytes = fs.readFileSync(name)

    const provider = new PouchDbCredentialsProvider({ name, key: KEY })
    await provider.initialize()

    expect(fs.existsSync(name)).to.equal(false)
    expect(fs.existsSync(`${name}.json`)).to.equal(true)

    const dir = path.dirname(name)
    const archived = fs.readdirSync(dir).find(f => f.startsWith(`${path.basename(name)}.legacy-`))
    expect(archived, 'expected an archived legacy file').to.exist
    const archivedBytes = fs.readFileSync(path.join(dir, archived))
    expect(Buffer.compare(archivedBytes, beforeBytes)).to.equal(0)
  })

  it('writes a rollback README next to the archived legacy file', async() => {
    const name = tmpName()
    seedLegacyStore(name, KEY, [{ service: 'password', account: 'a', password: 'p1' }])
    const provider = new PouchDbCredentialsProvider({ name, key: KEY })
    await provider.initialize()

    const dir = path.dirname(name)
    const readme = fs.readdirSync(dir).find(f => f.includes('.legacy-') && f.endsWith('.README.txt'))
    expect(readme).to.exist
    const body = fs.readFileSync(path.join(dir, readme), 'utf8')
    expect(body).to.include('roll back')
    expect(body).to.include(name)
  })

  it('does not touch the legacy file when the encryption key is wrong', async() => {
    const name = tmpName()
    seedLegacyStore(name, KEY, [{ service: 'password', account: 'a', password: 'p1' }])
    const beforeStat = fs.statSync(name)

    const provider = new PouchDbCredentialsProvider({ name, key: 'wrongkeywrongkeywrongkeywrongkey' })
    let err
    try { await provider.initialize() } catch (e) { err = e }
    expect(err).to.exist
    expect(err.message).to.match(/encryption key/i)

    expect(fs.existsSync(name)).to.equal(true)
    expect(fs.existsSync(`${name}.json`)).to.equal(false)
    expect(fs.statSync(name).size).to.equal(beforeStat.size)
  })

  it('does not touch the legacy file if any credential fails to decrypt', async() => {
    const name = tmpName()
    const enc = new EncryptionTransformer({ key: KEY })

    writeLegacySqlite(name, [
      { id: 'config', doc: { type: 'config', keyCheck: enc.keyCheck } },
      { id: 'doc-good', doc: { type: 'service', service: 'password', account: 'a', password: enc.encrypt('p1') } },
      // tampered ciphertext: keyCheck still matches but this row will fail to decrypt
      { id: 'doc-bad', doc: { type: 'service', service: 'password', account: 'b', password: { iv: 'deadbeef'.repeat(4), data: 'cafebabe'.repeat(8) } } }
    ])

    const provider = new PouchDbCredentialsProvider({ name, key: KEY })
    let err
    try { await provider.initialize() } catch (e) { err = e }
    expect(err).to.exist
    expect(err.code).to.equal('ECREDSDECRYPT')

    expect(fs.existsSync(name)).to.equal(true)
    expect(fs.existsSync(`${name}.json`)).to.equal(false)
  })

  it('is idempotent: a second initialise after migration is a no-op', async() => {
    const name = tmpName()
    seedLegacyStore(name, KEY, [{ service: 'password', account: 'a', password: 'p1' }])

    const provider = new PouchDbCredentialsProvider({ name, key: KEY })
    await provider.initialize()
    const dir = path.dirname(name)
    const archivedBefore = fs.readdirSync(dir).filter(f => f.includes('.legacy-')).sort()

    // simulate restart
    const provider2 = new PouchDbCredentialsProvider({ name, key: KEY })
    await provider2.initialize()
    const archivedAfter = fs.readdirSync(dir).filter(f => f.includes('.legacy-')).sort()

    expect(archivedAfter).to.deep.equal(archivedBefore)
    const list = await provider2.getCredentials('password')
    expect(list.map(r => r.password)).to.deep.equal(['p1'])
  })

  it('renames mrview sidecar files alongside the main legacy file', async() => {
    const name = tmpName()
    seedLegacyStore(name, KEY, [{ service: 'password', account: 'a', password: 'p1' }])
    // Synthesize a mrview sidecar of the same shape PouchDB createIndex creates.
    const sidecarPath = `${name}-mrview-deadbeef`
    fs.writeFileSync(sidecarPath, 'sidecar bytes')

    const provider = new PouchDbCredentialsProvider({ name, key: KEY })
    await provider.initialize()

    expect(fs.existsSync(sidecarPath)).to.equal(false)
    const dir = path.dirname(name)
    const archivedSidecar = fs.readdirSync(dir).find(f => f.startsWith(`${path.basename(sidecarPath)}.legacy-`))
    expect(archivedSidecar, 'expected sidecar to be archived, not deleted').to.exist
  })

  it('migrates an empty (config-only) legacy store cleanly', async() => {
    const name = tmpName()
    seedLegacyStore(name, KEY, [])

    const provider = new PouchDbCredentialsProvider({ name, key: KEY })
    await provider.initialize()
    const list = await provider.getCredentials('password')
    expect(list).to.deep.equal([])

    expect(fs.existsSync(`${name}.json`)).to.equal(true)
    expect(fs.existsSync(name)).to.equal(false)
  })

  it('aborts when the legacy store has no config doc (cannot verify key)', async() => {
    const name = tmpName()
    writeLegacySqlite(name, [
      // no config doc on purpose
      { id: 'doc-1', doc: { type: 'service', service: 'password', account: 'a', password: { iv: 'x', data: 'y' } } }
    ])

    const provider = new PouchDbCredentialsProvider({ name, key: KEY })
    let err
    try { await provider.initialize() } catch (e) { err = e }
    expect(err).to.exist
    expect(err.code).to.equal('ECREDSNOCONFIG')
    expect(fs.existsSync(name)).to.equal(true)
    expect(fs.existsSync(`${name}.json`)).to.equal(false)
  })

})
