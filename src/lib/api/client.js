
const request = require('request'),
      { privatesAccessor } = require('../privates'),
      { rBool, rString, isSet } = require('../utils/values'),
      App = require('./app'),
      Credentials = require('./credentials'),
      Environment = require('./environment'),
      Request = require('./request')


function loadCredentials(privates, credentials) {

  if (credentials) {
    return (credentials instanceof Credentials) ? credentials : new Credentials(credentials)
  }
  return privates.credentials
}

class Client {

  /**
   * @param input
   *
   *  environment
   *  app
   *  credentials
   */
  constructor(input) {

    const privates = privatesAccessor(this),
          options = Object.assign({}, isSet(input) ? input : {}),
          app = (options.app instanceof App) ? options.app : new App(options.app),
          environment = (options.environment instanceof Environment)
            ? options.environment
            : new Environment(options.environment),
          credentials = options.credentials && (options.credentials instanceof Credentials)
            ? options.credentials
            : new Credentials(options.credentials)

    Object.assign(privates, {

      // for apps using csrf tokens
      csrfToken: null,

      // for session-based requests
      cookieJar: request.jar(),

      // app
      app,

      // environment endpoint
      environment,

      // default credentials for the client
      credentials

    })

  }

  // --------------------------------------------------------

  /**
   * @param path
   * @param input
   *  credentials - defaults to client.credentials
   *  principal - set calling principal for signed requests
   *  authType - type of auth headers to use. defaults to 'auto'. [auto,token,signed,basic,none]
   *  method - request method
   *  body - request body for patch put and post
   *  json - defaults to true. if true, body must be an object.
   *  cookies - defaults
   *  query - request uri query parameters
   *  request - custom request options, passed directly to the request (https://github.com/request)
   * @returns {Promise<*>}
   */
  async call(path, input) {

    const privates = privatesAccessor(this),
          options = Object.assign({}, isSet(input) ? input : {}),
          requestOptions = Object.assign({
            qs: options.query,
            method: rString(options.method, 'GET').toUpperCase(),
            json: rBool(options.json, true)
          }, options.request),
          req = new Request(),
          credentials = loadCredentials(options.credentials),
          uri = options.environment.buildUrl(path)

    requestOptions.headers = Object.assign(
      credentials.getAuthorizationHeaders({
        type: options.authType, path, method: options.method, principal: options.principal
      }),
      isSet(requestOptions.headers) ? requestOptions.headers : {}
    )

    if (privates.csrfToken) {
      requestOptions.headers['medable-csrf-token'] = privates.csrfToken
    }

    req.on('response', (response) => {

      if (response.hasHeader('medable-csrf-token')) {
        privates.csrfToken = response.getHeader('medable-csrf-token')
      }
    })

    return req.run(Object.assign({ uri }, requestOptions))
  }

  get(path, options = {}) {
    return this.call(path, Object.assign({ method: 'GET' }, options))
  }

  post(path, body = {}, options = {}) {
    return this.call(path, Object.assign({ method: 'POST', body }, options))
  }

  put(path, body = {}, options = {}) {
    return this.call(path, Object.assign({ method: 'PUT', body }, options))
  }

  patch(path, body = [], options = {}) {
    return this.call(path, Object.assign({ method: 'PATCH', body }, options))
  }

  delete(path, options = {}) {
    return this.call(path, Object.assign({ method: 'DELETE' }, options))
  }

}


module.exports = Client
