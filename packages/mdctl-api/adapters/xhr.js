/* globals XMLHttpRequest */

const utils = require('axios/lib/utils'),
      buildURL = require('axios/lib/helpers/buildURL'),
      isURLSameOrigin = require('axios/lib/helpers/isURLSameOrigin'),
      createError = require('axios/lib/core/createError'),
      { Transform } = require('stream')

class TransformStream extends Transform {

  // eslint-disable-next-line no-underscore-dangle
  _transform(chunk, encoding, callback) {
    this.push(chunk)
    callback()
  }

}

function xhrAdapter(config) {
  return new Promise(((resolve, reject) => {
    const transform = new TransformStream()
    let requestData = config.data,
        // eslint-disable-next-line prefer-const
        requestHeaders = config.headers,
        request = new XMLHttpRequest()

    if (utils.isFormData(requestData)) {
      delete requestHeaders['Content-Type'] // Let the browser set it
    }
    // HTTP basic authentication
    if (config.auth) {
      const username = config.auth.username || '',
            password = config.auth.password || ''
      // eslint-disable-next-line no-undef
      requestHeaders.Authorization = `Basic ${btoa(`${username}:${password}`)}`
    }

    // eslint-disable-next-line max-len
    request.open(config.method.toUpperCase(), buildURL(config.url, config.params, config.paramsSerializer), true)

    // Set the request timeout in MS
    request.timeout = config.timeout

    // Listen for ready state
    request.onreadystatechange = function handleLoad() {
      if (!transform.writable) {
        request.abort() // writable stream is destroyed or ended, so we abort the reading.
      } else {
        if (request.readyState > XMLHttpRequest.HEADERS_RECEIVED) {
          const newData = request.response.substr(request.seenBytes)
          console.log('request.onreadystatechange', newData, transform)
          transform.write(newData)
          request.seenBytes = request.responseText.length
        }
        if (request.readyState === XMLHttpRequest.DONE) {
          transform.end()
          request = null
        }
      }
    }

    // Handle browser request cancellation (as opposed to a manual cancellation)
    request.onabort = function handleAbort() {
      if (!request) {
        return
      }

      reject(createError('Request aborted', config, 'ECONNABORTED', request))

      // Clean up request
      request = null
    }

    // Handle low level network errors
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(createError('Network Error', config, null, request))

      // Clean up request
      request = null
    }

    // Handle timeout
    request.ontimeout = function handleTimeout() {
      reject(createError(`timeout of ${config.timeout}ms exceeded`, config, 'ECONNABORTED',
        request))

      // Clean up request
      request = null
    }

    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    if (utils.isStandardBrowserEnv()) {
      // eslint-disable-next-line global-require
      const cookies = require('axios/lib/helpers/cookies'),

            // Add xsrf header
            // eslint-disable-next-line max-len
            xsrfValue = (config.withCredentials || isURLSameOrigin(config.url)) && config.xsrfCookieName
              ? cookies.read(config.xsrfCookieName)
              : undefined

      if (xsrfValue) {
        requestHeaders[config.xsrfHeaderName] = xsrfValue
      }
    }

    // Add headers to the request
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders, (val, key) => {
        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
          // Remove Content-Type if data is undefined
          delete requestHeaders[key]
        } else {
          // Otherwise add header to the request
          request.setRequestHeader(key, val)
        }
      })
    }

    // Add withCredentials to request if needed
    if (config.withCredentials) {
      request.withCredentials = true
    }

    // Add responseType to request if needed
    if (config.responseType) {
      try {
        request.responseType = config.responseType
      } catch (e) {
        // Expected DOMException thrown by browsers not compatible XMLHttpRequest Level 2.
        // eslint-disable-next-line max-len
        // But, this can be suppressed for 'json' type as it can be parsed by default 'transformResponse' function.
        if (config.responseType !== 'json') {
          throw e
        }
      }
    }

    // Handle progress if needed
    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', config.onDownloadProgress)
    }

    // Not all browsers support upload events
    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', config.onUploadProgress)
    }

    if (config.cancelToken) {
      // Handle cancellation
      config.cancelToken.promise.then((cancel) => {
        if (!request) {
          return
        }

        request.abort()
        reject(cancel)
        // Clean up request
        request = null
      })
    }

    if (requestData === undefined) {
      requestData = null
    }

    // Send the request
    request.send(requestData)
  }))
}

module.exports = {
  xhrAdapter,
  TransformStream
}
