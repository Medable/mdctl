/* eslint-disable class-methods-use-this */

const { Fault } = require('@medable/mdctl-core'),
      Task = require('../lib/task'),
      MdctlDocs = require('@medable/mdctl-docs')

class Docs extends Task {

  constructor() {

    const options = {
      destination: {
        default: '',
        type: 'string'
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
        
        --destination - documentation output directory
        --module - specifies the documentation module (JSDoc plugin + template)
        --source - directory to be documented
        --verbose - useful for debugging
    `
  }

}

module.exports = Docs
