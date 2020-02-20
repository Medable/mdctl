/* eslint-disable class-methods-use-this */

const { Fault } = require('@medable/mdctl-core'),
      Task = require('../lib/task'),
      MdctlDocs = require('@medable/mdctl-docs')

class Docs extends Task {

  constructor() {

    const options = {
      debug: {
        default: false,
        type: 'boolean'
      },
      destination: {
        default: '',
        type: 'string'
      },
      errors: {
        default: false,
        type: 'boolean'
      },
      log: {
        default: false,
        type: 'boolean'
      },
      module: {
        default: '',
        type: 'string'
      },
      source: {
        default: '',
        type: 'string'
      },
      verbose: {
        default: false,
        type: 'boolean'
      }
    }

    super(options)
    this.optionKeys = Object.keys(options)

  }

  async run(cli) {
    const params = await cli.getArguments(this.optionKeys)
    return MdctlDocs.generateDocumentation(params)
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
        
        --debug - outputs JSDoc command debugging
        --destination - output directory
        --errors - outputs JSDoc command errors
        --log - outputs JSDoc command results
        --module - documentation module name or location
        --source - source directory
        --verbose - outputs detailed JSDoc command results
`
  }

}

module.exports = Docs
