
const { EventEmitter } = require('events'),
      { privatesAccessor } = require('../privates'),
      { rString, isSet } = require('../utils/values'),
      { signPath } = require('./signer'),
      Request = require('./request')

class Client extends EventEmitter {

  /**
   * @param input
   *  environment
   *  app
   *  credentials
   *
   */
  constructor(input) {

    super()

    Object.assign(privatesAccessor(this), {

      csrfToken: null

    })

  }

  // --------------------------------------------------------

  getOptions({method = 'GET', headers = {}, body, ...rest}) {
    let options = {
      credentials: 'include',
      headers: this.getHeaders(headers),
      method,
      ...rest,
    }

    return (body) ? {...options, body: utils.stringify(body)} : options
  }

  getURL(path, query = {}) {

    let url = (path) ? this.getBaseURI() + path : this.getBaseURI()
    for (let arg in query) {
      query[arg] = toJS(query[arg])
      if (query.hasOwnProperty(arg) && !Array.isArray(query[arg])) {
        query[arg] = utils.stringify(query[arg])
      }
    }
    return withQuery(url, query)
  }

  // --------------------------------------------------------

  /**
   *
   * @param uri
   * @param input
   * @returns {Promise<*>}
   */
  async call(uri, input) {

    const privates = privatesAccessor(this),
          options = Object.assign({}, isSet(input) ? input : {}),
          request = new Request()

    options.headers = Object.assign({}, isSet(options.headers) ? options.headers : {})

    request.on('response', response => {
      if (response.hasHeader('medable-csrf-token')) {
        privates.csrfToken = response.getHeader('medable-csrf-token')
      }
    })

    if (privates.csrfToken) {
      options.headers['medable-csrf-token'] = privates.csrfToken
    }

    return request.run(Object.assign({ uri }, options))
  }

  get (path, options = {}) {
    const { query = {} } = options
    return this.call(this.getURL(path, query), this.getOptions(options))
  }


  post(path, body = {}, options = {}) {
    return this.call(this.getURL(path), this.getOptions({method: 'POST', body, ...options}))
  }

  put(path, body = {}, options = {}) {
    return this.call(this.getURL(path), this.getOptions({method: 'PUT', body, ...options}))
  }

  patch(path, body = [], options = {}) {
    return this.call(this.getURL(path), this.getOptions({method: 'PATCH', body, ...options}))
  }

  delete(path) {
    return this.call(this.getURL(path), this.getOptions({method: 'DELETE'}))
  }

}


module.exports = Client
