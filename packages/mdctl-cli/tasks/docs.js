/* eslint-disable class-methods-use-this */

const { generate } = require('@medable/mdctl-docs'),
      Task = require('../lib/task')

class Docs extends Task {

  constructor() {

    const optionSpec = {
      source: {
        default: '.',
        type: 'string'
      },
      destination: {
        default: 'docs',
        type: 'string'
      }
    }

    super(optionSpec)
    this.optionKeys = Object.keys(optionSpec)

  }

  async run(cli) {
    const options = await cli.getArguments(this.optionKeys)
    return generate(options)
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {

    return 'Medable documentation tool'

  }

  static help() {

    return `
    Medable documentation tool.

    Usage:

      mdctl docs [options]

    Arguments:

      options

        --destination - output directory
        --source - source directory
`
  }

}

module.exports = Docs
