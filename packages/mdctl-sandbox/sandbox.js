const _ = require('lodash'),
      {
        rInstance, isSet, rVal, rBool, rString, rPath
      } = require('mdctl-core-utils/values'),
      Fault = require('mdctl-core/fault'),
      Client = require('mdctl-api/client')

let Undefined

module.exports = {

  /**
   * run a sandboxed script in the target environment.
   *
   * @param input
   *  client: client or { provider, environment, credentials, etc }
   *  language: 'javascript'
   *  specification: 'es6'
   *  arguments: script.arguments
   *  body: request.body replacement
   *  script: function or string. the script to run.
   *  stats: boolean false. if true, return { result, stats }
   *  requestOptions
   *
   * @returns {Promise<*>}
   */
  async run(input) {

    let stats

    const options = isSet(input) ? input : {},
          client = rInstance(options.client, Client) ? options.client : new Client(options.client),
          payload = {
            language: rString(options.language, 'javascript'),
            specification: rString(options.specification, 'es6'),
            optimize: rBool(options.optimize, false),
            body: rVal(options.body, Undefined),
            arguments: rVal(options.arguments, Undefined),
            script: rString(
              options.script,
              _.isFunction(options.script)
                ? mainToString(options.script)
                : ''
            )
          },
          runOptions = {
            requestOptions: options.requestOptions
          },
          result = await client.post('/sys/script_runner', payload, runOptions)

    if (rBool(options.stats, false)) {
      try {
        stats = JSON.parse(client.response.headers['cortex-sandbox-stats'])
      } catch (e) {
        // eslint-disable-line no-empty
      }
      return { result, stats }
    }
    return result

  },

  /**
   * echo a result from the sandbox
   *
   * @param input
   *  client
   *  value
   * @returns {*}
   */
  echo(input) {

    return module.exports.run({
      client: rPath(input, 'client'),
      arguments: rPath(input, 'value'),
      script() {
        /* global script */
        script.exit(script.arguments)
      }
    })

  }

}

function mainToString(main) {

  const all = main.toString(),
        body = all.slice(all.indexOf('{') + 1, all.lastIndexOf('}'))

  if (!body) {
    throw Fault.create('kInvalidArgument', { reason: 'Invalid sandbox function' })
  }
  return body

}
