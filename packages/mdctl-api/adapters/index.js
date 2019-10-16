/* global window, FormData, Promise, Response, ReadableStream, Headers, fetch, AbortController */
const axios = require('axios'),
  { XhrAdapter, TransformStream } = require('./xhr')

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

function progressHelper(onProgress) {
  return (response) => {
    if (!response.body) return response

    let loaded = 0
    const contentLength = response.headers.get('content-length'),
      total = !contentLength ? -1 : parseInt(contentLength, 10)

    return new Response(
      new ReadableStream({
        start(controller) {
          const reader = response.body.getReader()
          return read()

          function read() {
            return reader.read()
              .then(({ done, value }) => {
                // eslint-disable-next-line no-void
                if (done) return void controller.close()
                loaded += value.byteLength
                onProgress({ loaded, total })
                controller.enqueue(value)
                return read()
              })
              .catch((error) => {
                console.error(error)
                controller.error(error)
              })
          }
        }
      })
    )
  }
}

function readerToTransform(response) {
  const transform = new TransformStream(),
    consume = responseReader => responseReader.read().then((result) => {
      if (result.done) {
        return transform.end()
      }

      // do something with the current chunk
      const chunk = result.value
      transform.write(chunk)

      return consume(responseReader)
    })
  consume(response.body.getReader())
  return { ...response, data: transform }
}

const fetchData = (config) => {
  let separator = '?'
  if (config.url.indexOf('?') > -1) {
    separator = '&'
  }
  const url = `${config.url}${config.params ? `${separator}${new URLSearchParams(config.params)}` : ''}`,
    { method, headers, body } = config,
    contentType = headers['Content-Type'] || headers['content-type'] || 'application/json',
    controller = new AbortController(),
    { signal } = controller

  let payload = JSON.stringify(body)
  if (contentType.indexOf('x-www-form-urlencoded') > -1) {
    payload = new URLSearchParams(body)
  } else if (body instanceof FormData) {
    payload = body
  }

  let fetchPromise = fetch(url, {
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

  if (config.onDownloadProgress) {
    fetchPromise.then(progressHelper(config.onDownloadProgress))
  }

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

module.exports = (config, isStream, isLegacy) => {
  if (window && isStream && !isLegacy && fetch) {
    // eslint-disable-next-line no-param-reassign
    return fetchData(config).then(response => readerToTransform(response))
  }
  if (window && isStream && isLegacy) {
    return XhrAdapter(config)
  }
  // eslint-disable-next-line no-param-reassign
  delete config.adapter
  return axios.request(config)
}
