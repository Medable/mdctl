const { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      {
        rString, isSet
      } = require('@medable/mdctl-core-utils/values')
// ------------------------------------------------------------------------------------------------
// secrets are stored for a balanced lookup.
//  - the known elements are in the service (service + . + type)
//  - the username is made up of protocol/host/endpoint/env/version/key/username
//    where username is anything after the version (protocol//host/env/version/username)
//  - passwords and secrets are stored in the password field as is.

class Secret {

  /**
   *
   * @param typeName
   * @param environment
   * @param username
   * @param apiKey the app api key.
   * @param password
   */
  constructor(typeName, environment, username, apiKey, password) {

    Object.assign(privatesAccessor(this), {
      typeName, environment, username, apiKey, password
    })
  }

  get type() {
    return privatesAccessor(this).typeName
  }

  get environment() {
    return privatesAccessor(this).environment
  }

  get username() {
    return privatesAccessor(this).username
  }

  get apiKey() {
    return privatesAccessor(this).apiKey
  }

  get password() {
    return privatesAccessor(this).password
  }

  get encoded() {
    const { environment, username, apiKey } = privatesAccessor(this)
    return `${environment.url}/${apiKey}/${username}`
  }

  toJSON() {
    const { typeName, environment, apiKey } = privatesAccessor(this)
    return {
      type: typeName,
      url: environment.url,
      apiKey
    }
  }

  /**
   * @param input
   *  apiKey optional. force a different api key
   */
  getAuthorizationHeaders(input) {

    const options = isSet(input) ? input : {},
          privates = privatesAccessor(this)

    return {
      'medable-client-key': rString(options.apiKey, privates.apiKey)
    }

  }

}

module.exports = Secret
