
const request = require('request'),
      clone = require('clone'),
      { privatesAccessor } = require('../privates'),
      {
        rVal, rBool, rString, isSet
      } = require('../utils/values'),
      pathTo = require('../utils/path.to'),
      { CredentialsManager } = require('./credentials'),
      Environment = require('./environment'),
      Request = require('./request')

class Client {

  /**
   * @param input
   *
   *  environment
   *  credentials
   *  requestOptions (object) default request options
   *  sessions (boolean:false) automatically load and store fingerprints and
   *    session data in the keychain for a login session.
   */
  constructor(input) {

    const privates = privatesAccessor(this),
          options = Object.assign({}, isSet(input) ? input : {}),
          environment = (options.environment instanceof Environment)
            ? options.environment
            : new Environment(options.environment),
          credentials = CredentialsManager.create(environment, options.credentials)

    Object.assign(privates, {

      // for apps using csrf tokens
      csrfToken: null,

      // for session-based requests
      sessions: rBool(options.sessions),

      cookieJar: request.jar(),

      // environment endpoint
      environment,

      // default credentials for the client
      credentials,

      // default request options
      requestOptions: isSet(options.requestOptions) ? clone(options.requestOptions) : {},

      // last response object
      response: null

    })

  }

  get credentials() {
    return privatesAccessor(this).credentials
  }

  get environment() {
    return privatesAccessor(this).environment
  }

  get response() {
    return privatesAccessor(this).response
  }

  get requestOptions() {
    return clone(privatesAccessor(this).requestOptions)
  }

  getRequestOption(option) {
    return pathTo(privatesAccessor(this).requestOptions, option)
  }

  setRequestOption(option, value) {
    pathTo(privatesAccessor(this).requestOptions, option, value)
  }

  // --------------------------------------------------------

  /**
   * @param path
   * @param input
   *  credentials - defaults to client.credentials
   *  principal - set calling principal for signed requests
   *  method - request method
   *  basic - boolean (false). force username/password basic auth headers for password credentials.
   *  body - request body for patch put and post
   *  json - defaults to true. if true, body must be an object.
   *  cookies - defaults to true. set to false to prevent sending cookies
   *  query - request uri query parameters
   *  requestOptions - custom request options, passed directly to the request (https://github.com/request)
   *  stream - pipes the req to the stream and returns (errors and results are not parsed)
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
            privates.requestOptions,
            options.requestOptions
          ),
          req = new Request(),
          basic = rBool(options.basic),
          credentials = options.credentials
            ? CredentialsManager.create(privates.environment, options.credentials)
            : privates.credentials,
          { environment } = privates,
          uri = environment.buildUrl(path),
          { stream } = options,
          isSession = privates.sessions && credentials.type === 'password' && requestOptions.jar

    // load the latest fingerprint and session data from the keychain whenever possible.
    if (isSession) {

      const fingerprint = await CredentialsManager.getCustom('fingerprint', `${environment.endpoint}/${credentials.apiKey}`),
            session = await CredentialsManager.getCustom('session', environment.url)

      if (fingerprint) {
        requestOptions.jar.setCookie(fingerprint, environment.endpoint)
      }

      if (session) {
        if (session.csrf) {
          privates.csrfToken = session.csrf
        }
        if (session.sid) {
          requestOptions.jar.setCookie(session.sid, environment.url)
        }
      }

    }

    requestOptions.headers = Object.assign(
      credentials.getAuthorizationHeaders({
        basic, path, method: options.method, principal: options.principal
      }),
      isSet(requestOptions.headers) ? requestOptions.headers : {}
    )

    if (privates.csrfToken) {
      requestOptions.headers['medable-csrf-token'] = privates.csrfToken
    }

    return new Promise((resolve, reject) => {
      requestOptions.strictSSL = false
      req.run(Object.assign({ uri, stream }, requestOptions))
        .then(async(result) => {

          if (stream) {
            return resolve(result)
          }

          const { response } = req

          privates.response = response

          if (isSet(response.headers['medable-csrf-token'])) {
            privates.csrfToken = response.headers['medable-csrf-token']
          }

          if (isSession) {

            // store the latest fingerprint in the keychain for this endpoint.
            try {
              const fingerprint = requestOptions.jar.getCookies(environment.endpoint).filter(
                cookie => cookie.key === 'md.fingerprint' && cookie.path === '/'
              )[0]

              if (fingerprint) {

                const fingerprintString = fingerprint.toString(),
                      existing = await CredentialsManager.getCustom(
                        'fingerprint',
                        `${environment.endpoint}/${credentials.apiKey}`
                      )

                if (existing !== fingerprintString) {

                  await CredentialsManager.setCustom(
                    'fingerprint',
                    `${environment.endpoint}/${credentials.apiKey}`,
                    fingerprintString
                  )

                }

              }
            } catch (err) {
              return reject(err)
            }

            // store the csrf token and session cookie.
            const existing = await CredentialsManager.getCustom('session', environment.url),
                  session = {
                    csrf: response.headers['medable-csrf-token'],
                    sid: rVal(requestOptions.jar.getCookies(environment.url).filter(
                      cookie => cookie.key === 'md.sid' && cookie.path === `/${environment.env}`
                    )[0], '').toString()
                  }

            if (!existing || existing.csrf !== session.csrf || existing.sid !== session.sid) {

              await CredentialsManager.setCustom(
                'session',
                environment.url,
                session
              )
            }

          }

          return resolve(result)

        })
        .catch((err) => {

          privates.response = req.response
          reject(err)

        })


    })
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
