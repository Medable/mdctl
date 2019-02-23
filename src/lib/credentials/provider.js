
const { CredentialsProvider } = require('./providers/provider'),
      { MemoryCredentialsProvider } = require('./providers/memory'),
      { KeytarCredentialsProvider } = require('./providers/keytar'),
      { PouchDbCredentialsProvider } = require('./providers/pouchdb')

module.exports = {
  CredentialsProvider,
  KeytarCredentialsProvider,
  MemoryCredentialsProvider,
  PouchDbCredentialsProvider
}
