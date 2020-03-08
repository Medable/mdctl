
const { URL } = require('universal-url'),
      { isAbsoluteURL, isSet, rString } = require('@medable/mdctl-core-utils/values'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      path = require('path'),
      supportedProtocols = new Set(['http:', 'https:']),
      supportedVersions = new Set(['v2'])

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
            endpoint = rString(options.endpoint, ''),
            env = rString(options.env, ''),
            version = rString(options.version, 'v2')

      str = path.join(endpoint, env, version)
    }

    if (!isAbsoluteURL(str)) { // be a little forgiving and assume https://
      str = `https://${str}`
    }

    const privates = privatesAccessor(this),
          url = new URL('', str),
          [, env,, version] = path.normalize(url.pathname).match(/(^[^/]+)(\/(v[0-9]{1,}))?/) || []


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
    return path.join(this.endpoint, this.env, this.version)
  }

  buildUrl(p) {
    return path.join(this.url, p)
  }

}

module.exports = Environment
