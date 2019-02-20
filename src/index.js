
const Fault = require('./lib/fault'),
      { Manifest } = require('./lib/manifest'),
      api = require('./lib/api'),
      env = require('./lib/env'),
      credentials = require('./lib/credentials')

module.exports = {

  api,
  credentials,
  env,

  Fault,
  Manifest
}
