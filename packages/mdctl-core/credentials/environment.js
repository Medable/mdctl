
const { URL } = require('url'),
      { rString, isSet } = require('mdctl-core-utils/values'),
      { privatesAccessor } = require('mdctl-core-utils/privates'),
      supportedProtocols = new Set(['http:', 'https:']),
      supportedVersions = new Set(['v2'])

function fixPath(path) {
  return rString(path, '').trim().replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '')
}

class Environment {

  /**
   * @param input
   *  string
   *  object {endpoint, env}
   */
  constructor(input) {

    let str = input

    if (!rString(input)) {

      const options = isSet(input) ? input : {},
            endpoint = rString(options.endpoint, '').replace(/[/]+$/, ''),
            env = rString(options.env, '').replace(/\//g, ''),
            version = rString(options.version, 'v2').replace(/\//g, '')

      str = `${endpoint}/${env}/${version}`
    }

    if (!str.includes('://')) { // be a little forgiving and assume https://
      str = `https://${str}`
    }

    const privates = privatesAccessor(this),
          url = new URL('', str),
          [, env,, version] = fixPath(url.pathname).match(/(^[^/]+)(\/(v[0-9]{1,}))?/) || []


    Object.assign(privates, {
      secure: url.protocol.endsWith('s:'),
      protocol: url.protocol,
      host: url.host,
      env: rString(env, ''),
      version: rString(version, 'v2')
    })

    if (!(rString(privates.env, ''))) {
      throw new TypeError(`Invalid environment env for ${this.url}. Expected and org env/code`)
    }

    if (!supportedProtocols.has(privates.protocol)) {
      throw new TypeError(`Invalid environment protocol. Supported protocols are: ${Object.values(supportedProtocols)}`)
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

  get endpoint() {
    return `${this.protocol}//${this.host}`
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
