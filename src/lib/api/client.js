
const request = require('request'),
      { privatesAccessor } = require('../privates'),
      { rBool, rString, isSet } = require('../utils/values'),
      pathTo = require('../utils/path.to'),
      { Credentials } = require('./credentials'),
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
   *  credentials
   *  request
   */
  constructor(input) {

    const privates = privatesAccessor(this),
          options = Object.assign({}, isSet(input) ? input : {}),
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

      // environment endpoint
      environment,

      // default credentials for the client
      credentials,

      // default request options
      request: Object.assign({}, isSet(options.request) ? options.request : {})

    })

  }

  get credentials() {
    return privatesAccessor(this).credentials
  }

  get environment() {
    return privatesAccessor(this).environment
  }

  getRequestOption(option) {
    return pathTo(privatesAccessor(this).request, option)
  }

  setRequestOption(option, value) {
    pathTo(privatesAccessor(this).request, option, value)
  }

  // --------------------------------------------------------

  /**
   * @param path
   * @param input
   *  credentials - defaults to client.credentials
   *  principal - set calling principal for signed requests
   *  authType - type of headers to use. defaults to 'auto'. [auto,token,signature,password,none]
   *  method - request method
   *  body - request body for patch put and post
   *  json - defaults to true. if true, body must be an object.
   *  cookies - defaults to true. set to false to prevent sending cookies
   *  query - request uri query parameters
   *  request - custom request options, passed directly to the request (https://github.com/request)
   * @returns {Promise<*>}
   */
  async call(path, input) {

    const privates = privatesAccessor(this),
          options = Object.assign({}, isSet(input) ? input : {}),
          requestOptions = Object.assign(
            {
              qs: options.query,
              body: options.body,
              method: rString(options.method, 'GET').toUpperCase(),
              json: rBool(options.json, true),
              jar: rBool(options.cookies, true) && privates.cookieJar
            },
            privates.request,
            options.request
          ),
          req = new Request(),
          credentials = loadCredentials(privates, options.credentials),
          uri = privates.environment.buildUrl(path)

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

      if (isSet(response.headers['medable-csrf-token'])) {
        privates.csrfToken = response.headers['medable-csrf-token']
      }
    })

    // catch error so the emitter does not throw unhandled.
    req.on('error', () => {

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
