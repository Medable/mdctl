
const { URL } = require('url'),
      { privatesAccessor } = require('../privates'),
      { rString, isSet, rBool } = require('../utils/values'),
      supportedProtocols = new Set(['http:', 'https:']),
      supportedVersions = new Set(['v2'])

function fixPath(path) {

  return rString(path, '').trim().replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '')

}

class Environment {

  constructor(input) {

    const privates = privatesAccessor(this)

    if (rString(input)) {

      const url = new URL('', input),
            [, env,, version] = fixPath(url.pathname).match(/(^[^/]+)(\/(v[0-9]{1,}))?/) || []

      Object.assign(privates, {
        secure: url.protocol.endsWith('s:'),
        protocol: url.protocol,
        host: url.host,
        env: rString(env, ''),
        version: rString(version, 'v2')
      })

    } else {

      const options = isSet(input) ? input : {},
            secure = rBool(options.secure, true)

      Object.assign(privates, {
        secure,
        protocol: secure ? 'https:' : 'http:',
        host: rString(options.endpoint, 'api.dev.medable.com'),
        env: rString(options.env, ''),
        version: rString(options.version, 'v2')
      })

    }

    if (!supportedProtocols.has(privates.protocol)) {
      throw new TypeError(`Invalid environment protocol. Supported protocols are: ${Object.values(supportedProtocols)}`)
    }

    if (!supportedVersions.has(privates.version)) {
      throw new TypeError(`Invalid environment version. Supported versions are: ${Object.values(supportedVersions)}`)
    }

    if ((!privates.secure && privates.protocol.endsWith('s:')) || (privates.secure && !privates.protocol.endsWith('s:'))) {
      throw new TypeError('Invalid environment protocol. Mismatched secure/protocol options')
    }

  }

  get secure() {
    return privatesAccessor(this).secure
  }

  get protocol() {
    return privatesAccessor(this).protocol
  }

  get host() {
    return privatesAccessor(this).host
  }

  get env() {
    return privatesAccessor(this).env
  }

  get version() {
    return privatesAccessor(this).version
  }

  get url() {
    return `${this.protocol}//${this.host}/${this.env}/${this.version}`
  }

  buildUrl(path) {
    return `${this.url}/${fixPath(path)}`
  }

}

module.exports = Environment
