const { detectAuthType } = require('./util'),
      { CredentialsProvider } = require('./providers/provider'),
      { MemoryCredentialsProvider } = require('./providers/memory'),
      { KeytarCredentialsProvider } = require('./providers/keytar'),
      { PouchDbCredentialsProvider } = require('./providers/pouchdb')

module.exports = {
  detectAuthType,
  CredentialsProvider,
  KeytarCredentialsProvider,
  MemoryCredentialsProvider,
  PouchDbCredentialsProvider
}
