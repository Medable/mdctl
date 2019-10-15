/* global window */
const axios = require('axios'),
      gaxios = require('gaxios'),
      { XhrAdapter, TransformStream } = require('./xhr')

module.exports = (config, isStream, isLegacy) => {
  if (window && isStream && isLegacy) {
    return XhrAdapter(config)
  } if (window && isStream && !isLegacy) {
    // eslint-disable-next-line no-param-reassign
    delete config.adapter
    return gaxios.request(config).then((response) => {
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
      consume(response.data.getReader())
      return { ...response, data: transform }
    })
  }
  // eslint-disable-next-line no-param-reassign
  delete config.adapter
  return axios.request(config)
}
