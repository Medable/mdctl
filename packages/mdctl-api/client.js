
const tough = require('tough-cookie'),
      axios = require('axios'),
      clone = require('clone'),
      { pathTo } = require('@medable/mdctl-core-utils'),
      {
        isAbsoluteURL, isSet, rBool, rPath, rString, rVal
      } = require('@medable/mdctl-core-utils/values'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { CredentialsProvider } = require('@medable/mdctl-core/credentials/provider'),
      { Config, ClientConfig } = require('@medable/mdctl-core/config'),
      { Fault } = require('@medable/mdctl-core'),
      Environment = require('@medable/mdctl-core/credentials/environment'),
      Request = require('./request')

class Client {

  /**
   * @param input
   *
   *  environment
   *  credentials
   *  requestOptions (object) default request options
   *    strictSSL: default true || Config.global.client.strictSSL
   *    ...
   *  provider: credentials provider || Config.global.credentials.provider
   *  sessions (boolean:false) automatically load and store fingerprints and
   *    session data in the keychain for a login session.
   *  cancelRequest: Axios token to cancel a request
   *  onDownloadProgress: function to capture download progress
   *  onUploadProgress: function to capture upload progress
   */
  constructor(input) {

    if (rPath(input, 'provider') && !(input.provider instanceof CredentialsProvider)) {
      throw Fault.create('kInvalidArgument', { reason: 'The provider options requires a CredentialsProvider' })
    }

    const options = Object.assign({}, isSet(input) ? input : {}),
          privates = privatesAccessor(this),
          provider = options.provider || Config.global.credentials.provider,
          environment = (options.environment instanceof Environment)
            ? options.environment
            : new Environment(options.environment),
          credentials = provider.create(environment, options.credentials)

    Object.assign(privates, {

      // use strictSSL in requests. this gets merged into requestOptions during a call.
      config: new ClientConfig({
        strictSSL: rBool(options.strictSSL, Config.global.client.strictSSL)
      }),

      // for apps using csrf tokens
      csrfToken: null,

      // for session-based requests
      sessions: rBool(options.sessions),

      cookieJar: new tough.CookieJar(),

      // environment endpoint
      environment,

      // the credentials provider
      provider,

      // default credentials for the client
      credentials,

      // default request options
      requestOptions: isSet(options.requestOptions) ? clone(options.requestOptions) : {},

      // last response object
      response: null,

      cancelRequest: options.cancelRequest || axios.CancelToken.source(),
      onDownloadProgress: options.onDownloadProgress,
      onUploadProgress: options.onUploadProgress,

    })

  }

  get cancelToken() {
    return axios.CancelToken
  }

  cancelCurrentRequest() {
    const { cancelRequest } = privatesAccessor(this)
    if (cancelRequest.token) {
      cancelRequest.cancel()
    }
  }


  get provider() {
    return privatesAccessor(this).provider
  }

  get strictSSL() {
    return privatesAccessor(this).config.strictSSL
  }

  set strictSSL(strictSSL) {
    privatesAccessor(this).config.strictSSL = Boolean(strictSSL)
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
   *  body - request body for patch put and post. can be a stream.
   *  json - defaults to true. if true, body must be an object.
   *  cookies - defaults to true. set to false to prevent sending cookies
   *  query - request uri query parameters
   *  cancelRequest - cancel request token
   *  requestOptions - custom request options, passed directly to the request (https://github.com/axios/axios)
   *    strictSSL: default to client strictSSL
   *  stream - pipes the req to the stream and returns (errors and results are not parsed)
   * @returns {Promise<*>}
   */
  async call(path, input) {

    const privates = privatesAccessor(this),
          options = Object.assign({}, isSet(input) ? input : {}),
          requestOptions = Object.assign(
            {
              params: options.query,
              data: options.body,
              method: rString(options.method, 'GET').toUpperCase(),
              json: rBool(options.json, true),
              jar: rBool(options.cookies, true) && privates.cookieJar
            },
            privates.requestOptions,
            options.requestOptions,
            {
              // eslint-disable-next-line max-len
              cancelToken: options.cancelRequest ? options.cancelRequest.token : privates.cancelRequest.token,
              onDownloadProgress: privates.onDownloadProgress,
              onUploadProgress: privates.onUploadProgress
            }
          ),
          req = new Request(),
          basic = rBool(options.basic),
          credentials = options.credentials
            ? privates.provider.create(privates.environment, options.credentials)
            : privates.credentials,
          { environment } = privates,
          url = isAbsoluteURL(path) ? path : environment.buildUrl(path),
          { stream } = options,
          isSession = privates.sessions && credentials.type === 'password' && requestOptions.jar

    // load the latest fingerprint and session data from the keychain whenever possible.
    if (isSession) {

      const fingerprint = await privates.provider.getCustom('fingerprint', `${environment.endpoint}/${credentials.apiKey}`),
            session = await privates.provider.getCustom('session', environment.url)

      if (fingerprint) {
        requestOptions.jar.setCookieSync(fingerprint, environment.endpoint)
      }

      if (session) {
        if (session.csrf) {
          privates.csrfToken = session.csrf
        }
        if (session.sid) {
          requestOptions.jar.setCookieSync(session.sid, environment.url)
        }
      }

    }

    requestOptions.headers = Object.assign(
      credentials.getAuthorizationHeaders({
        basic, path, method: options.method, principal: options.principal
      }),
      isSet(requestOptions.headers) ? requestOptions.headers : {}
    )

    requestOptions.strictSSL = rBool(requestOptions.strictSSL, this.strictSSL)

    if (privates.csrfToken) {
      requestOptions.headers['medable-csrf-token'] = privates.csrfToken
    }

    return new Promise((resolve, reject) => {
      req.run(Object.assign({ url, stream }, requestOptions))
        .then(async(result) => {

          const { response } = req

          privates.response = response

          if (stream) {
            return resolve(result)
          }

          if (isSet(response.headers['medable-csrf-token'])) {
            privates.csrfToken = response.headers['medable-csrf-token']
          }

          if (isSession) {

            // store the latest fingerprint in the keychain for this endpoint.
            try {
              const fingerprint = requestOptions.jar.getCookiesSync(environment.endpoint).filter(
                cookie => cookie.key === 'md.fingerprint' && cookie.path === '/'
              )[0]

              if (fingerprint) {

                const fingerprintString = fingerprint.toString(),
                      existing = await privates.provider.getCustom(
                        'fingerprint',
                        `${environment.endpoint}/${credentials.apiKey}`
                      )

                if (existing !== fingerprintString) {

                  await privates.provider.setCustom(
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
            const existing = await privates.provider.getCustom('session', environment.url),
                  session = {
                    csrf: response.headers['medable-csrf-token'],
                    sid: rVal(requestOptions.jar.getCookiesSync(environment.url).filter(
                      cookie => cookie.key === 'md.sid' && cookie.path === `/${environment.env}`
                    )[0], '').toString()
                  }

            if (!existing || existing.csrf !== session.csrf || existing.sid !== session.sid) {

              await privates.provider.setCustom(
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
