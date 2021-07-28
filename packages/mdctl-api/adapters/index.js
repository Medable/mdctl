/* global window, FormData, Headers, fetch, AbortController */
const axios = require('axios'),
      { xhrAdapter, TransformStream } = require('./xhr'),
      fetchData = (config) => {
        let separator = '?'
        if (config.url.indexOf('?') > -1) {
          separator = '&'
        }
        const url = `${config.url}${config.params ? `${separator}${new URLSearchParams(config.params)}` : ''}`,
              { method, headers, body } = config,
              contentType = headers['Content-Type'] || headers['content-type'] || 'application/json',
              controller = new AbortController(),
              { signal } = controller

        // eslint-disable-next-line one-var
        let payload = JSON.stringify(body),
            fetchPromise = null
        if (contentType.indexOf('x-www-form-urlencoded') > -1) {
          payload = new URLSearchParams(body)
        } else if (body instanceof FormData) {
          payload = body
        }

        fetchPromise = fetch(url, {
          method,
          headers: new Headers(headers),
          mode: 'cors',
          credentials: 'include',
          body: payload,
          signal
        }).then((response) => {
          if (response.ok) {
            return response
          }
          // eslint-disable-next-line prefer-promise-reject-errors
          return Promise.reject({ response: readerToTransform(response) })
        })

        if (config.cancelToken) {
          // Handle cancellation
          config.cancelToken.promise.then((cancel) => {
            controller.abort()
            fetchPromise = null
            return Promise.reject(cancel)
          })
        }
        if (config.timeout && config.timeout > 0) {
          return promiseTimeout(config.timeout)(fetchPromise)
        }

        return fetchPromise

      }

function promiseTimeout(msec) {
  return (promise) => {
    let isDone = false
    // eslint-disable-next-line no-return-assign
    promise.then(() => isDone = true)
    const timeout = new Promise((completed, expired) => setTimeout(() => {
      if (!isDone) {
        // eslint-disable-next-line no-param-reassign,no-underscore-dangle
        promise.__timeout = true
        expired(new Error('Timeout expired'))
      }
    }, msec))
    return Promise.race([promise, timeout])
  }
}

function readerToTransform(response) {
  const transform = new TransformStream(),
        consume = responseReader => responseReader.read().then((result) => {
          if (!transform.writable) {
            return responseReader.cancel('writable stream destroyed or ended before reader finish.')
          }
          if (result.done) {
            return transform.end()
          }

          // do something with the current chunk
          const chunk = result.value
          console.log('readerToTransform', result, transform)
          transform.write(chunk)

          return consume(responseReader)
        })
  consume(response.body.getReader())
  return { ...response, data: transform }
}

module.exports = (config, isStream, isLegacy) => {
  if (typeof window !== 'undefined' && isStream && !isLegacy && fetch) {
    // eslint-disable-next-line no-param-reassign
    return fetchData(config).then(response => readerToTransform(response))
  }
  if (typeof window !== 'undefined' && isStream && isLegacy) {
    return xhrAdapter(config)
  }
  // eslint-disable-next-line no-param-reassign
  delete config.adapter
  return axios.request(config)
}
