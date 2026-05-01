# mdctl-credentials-provider-pouchdb

> **Deprecated package name.** This package no longer uses PouchDB. It will
> be renamed to `@medable/mdctl-credentials-provider-file` in a future
> release. The exported class name and constructor signature remain
> unchanged so consumers continue to work as a drop-in upgrade.

A small encrypted-at-rest credentials provider for the Medable Developer
Tools, backed by a single JSON file on disk.

Credentials are encrypted with AES-256-CBC using a key supplied by the
caller (typically stored in the OS keychain by `mdctl`). The store itself
never sees plaintext secrets.

## Usage

```js
const PouchDbCredentialsProvider = require('@medable/mdctl-credentials-provider-pouchdb'),
      provider = new PouchDbCredentialsProvider({
        name: path.join(os.homedir(), '.medable/mdctl.db'),
        key: 'whatEv3rY0uW4nt@here'  // 32 bytes
      })

await provider.add('env', {
  apiKey: 'abcdefghijklmnopqrstuv',
  username: 'test@medable.com',
  password: 'password'
})

await provider.list('env', { type: 'password' })
```

The constructor signature, exported class name, and the `CredentialsProvider`
API surface are identical to the previous PouchDB-backed implementation.

## What changed

The previous implementation used PouchDB with the
`pouchdb-adapter-node-websql` adapter, which transitively pulled in
`sqlite3@4.2.0`. That dependency is unmaintained and no longer compiles
against modern V8 headers, breaking installs on Node 22 and 24. See
the discussion in
[Medable/mdctl#xxx](https://github.com/Medable/mdctl/issues) for the
incident.

The new implementation:

- Stores credentials in a single JSON file at `<name>.json` (e.g.
  `~/.medable/mdctl.db.json`).
- Has no native dependencies for normal operation. `better-sqlite3` is
  declared as an `optionalDependency` and is used **only** to read the
  legacy SQLite store during one-shot migration.
- Performs atomic writes (write-temp + `fsync` + `rename`).
- Uses an `mkdir`-based exclusive lock around mutations and migration to
  prevent concurrent processes from corrupting the store.
- Verifies the encryption key on every `load` (via a stored `keyCheck`
  hash, identical to the previous implementation).

## Migration from the legacy PouchDB store

When the provider initialises and finds a legacy SQLite database at
`<name>` but no `<name>.json`, it migrates automatically with the
following safety properties:

1. The legacy file is opened in **read-only** mode via `better-sqlite3`.
2. The supplied encryption key is verified against the stored `keyCheck`
   doc **before any other work**. A wrong key aborts the migration; the
   legacy file is left untouched.
3. Every credential is **decrypted as an integrity check** during
   migration. If any credential fails to decrypt the migration aborts
   and the legacy file is left untouched.
4. Tombstoned (`deleted=1`), `_design/...`, `_local/...` and `config`
   documents are skipped. Only winning revisions of `type: 'service'`
   documents are migrated.
5. The new JSON file is written atomically and re-read to verify it
   parses and matches the expected `keyCheck` and credential count.
   **Only after this verification succeeds** is the legacy file touched.
6. The legacy file is **renamed** to `<name>.legacy-<ISO-timestamp>`,
   not deleted. PouchDB's `mrview` index sidecars are renamed alongside
   it. A `<name>.legacy-<ISO-timestamp>.README.txt` is written next to
   the archive describing how to roll back.

The migration is idempotent: a second `initialise()` after a successful
migration is a no-op (the JSON file already exists, so the legacy path
is skipped entirely).

### If `better-sqlite3` is unavailable

The migration path requires `better-sqlite3`. It is declared as an
`optionalDependency` so its install failures will not fail
`npm install` for users on platforms without prebuilds.

If a legacy file is found but `better-sqlite3` is not loadable, the
provider throws an error with code `ECREDSDRIVERMISSING` and instructions
to either install `better-sqlite3` or rename the legacy file aside.
The provider deliberately refuses to silently start fresh while there
is a legacy file present, to avoid the user thinking their stored
credentials were lost.

### Manual rollback

The legacy file is preserved as `<name>.legacy-<timestamp>`. To roll
back:

1. Stop any running `mdctl` processes.
2. Delete or move aside `<name>.json`.
3. `mv <name>.legacy-<timestamp> <name>`.
4. Reinstall a version of `mdctl` that predates the migration.

## On-disk format

```json
{
  "version": 1,
  "keyCheck": "<sha256 hex of encryption key>",
  "credentials": [
    {
      "_id": "<md5 of service+account>",
      "type": "service",
      "service": "password",
      "account": "<endpoint URL with username>",
      "password": { "iv": "<hex>", "data": "<hex ciphertext>" }
    }
  ]
}
```

The encryption format (`{iv, data}` AES-256-CBC) is **byte-compatible**
with the previous PouchDB-backed store, so migrated payloads are
preserved verbatim and never re-encrypted.

The file is written with mode `0600` on POSIX systems.

## Environment variables

| Variable                              | Effect                                            |
|---------------------------------------|---------------------------------------------------|
| `MDCTL_SUPPRESS_POUCHDB_DEPRECATION`  | Suppress the package-name deprecation warning.    |
