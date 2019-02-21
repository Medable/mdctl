const {
  CredentialsProvider, MemoryProvider, KeytarCredentialsProvider, detectAuthType
} = require('./provider')

module.exports = {
  detectAuthType,
  CredentialsProvider,
  MemoryProvider,
  KeytarCredentialsProvider
}
