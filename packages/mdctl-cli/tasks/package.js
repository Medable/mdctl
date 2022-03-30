/* eslint-disable class-methods-use-this */
const _ = require('lodash'),
      Stream = require('stream'),
      { pathTo } = require('@medable/mdctl-core-utils'),
      { isSet } = require('@medable/mdctl-core-utils/values'),
      Task = require('../lib/task'),
      { installPkg } = require('../lib/package')

class Package extends Task {

  constructor() {

    const options = {
      dryRun: {
        type: 'boolean',
        default: false
      },
      debug: {
        type: 'boolean',
        default: false
      },
      dir: {
        type: 'string',
        default: ''
      },
      token: {
        type: 'string',
        default: ''
      }
    }

    super(options)
    this.optionKeys = Object.keys(options)

  }

  async run(cli) {

    const arg1 = this.args('1'),
          handler = `package@${arg1}`

    if (!isSet(arg1)) {
      return console.log(Package.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }

    return this[handler](cli)

  }

  async 'package@get'(cli) {
    throw Error('Not Implemented')
  }

  async 'package@list'(cli) {
    throw Error('Not Implemented')
  }

  async 'package@publish'(cli) {
    throw Error('Not Implemented')
  }

  async 'package@install'(cli) {
    // this will install a package in target organization
    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          params = await cli.getArguments(this.optionKeys),
          format = this.args('format'),

          outputResult = (data) => {
            const formatted = Task.formatOutput(data, format),
                  isError = data && data.object === 'fault'

            if (isError) {
              console.error(formatted)
            } else {
              console.log(formatted)
            }
          }
    // eslint-disable-next-line consistent-return
    let stream,
        postImportFn = () => {
        },
        memoObject,
        complete,
        fault

    try {
      try {
        // eslint-disable-next-line max-len
        // read package.json
        const { response, postImport, memo } = await installPkg({ client, ...params })
        stream = response
        postImportFn = postImport
        memoObject = memo
      } catch (e) {
        if (e instanceof Stream) {
          stream = e
        } else {
          throw e
        }
      }

      complete = await new Promise((resolve, reject) => {
        let hasCompleted = false
        stream.on('data', (data) => {
          if (data instanceof Buffer) {
            /* eslint-disable no-param-reassign */
            try {
              data = JSON.parse(data.toString())
            } catch (e) {
              // do nothing
            }
          }
          if (pathTo(data, 'object') === 'fault') {
            reject(data)
          } else if (pathTo(data, 'object') === 'result') {
            outputResult(data.data, format)
          } else {
            outputResult(data, format)
            if (data.type === 'status' && data.stage === 'complete') {
              hasCompleted = true
            }
          }
        })

        stream.once('error', (err) => {
          reject(err)
        })

        stream.on('end', () => {
          resolve(hasCompleted)
        })
      })
      if (complete) {
        console.log('Install Finished!')
      } else {
        console.log('Install Finished with errors....!')
      }
    } catch (err) {
      fault = err
      throw err
    } finally {
      // eslint-disable-next-line no-unused-expressions
      postImportFn && await postImportFn({
        client, err: fault, complete, memo: memoObject
      })
    }

  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'packages tools'
  }

  static help() {

    return `
      Environment environment tools.

      Usage:

        mdctl package [command] [options]

      Arguments:

        command
          get - get a package from registry
          list - get a list of published packages from registry
          publish - publish as package
          install - install a new package in remote target

        options
          --dry-run - will skip calling api
    `
  }

}
module.exports = Package
