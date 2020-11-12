/* eslint-disable class-methods-use-this */

const MdctlDocs = require('@medable/mdctl-docs'),
      Task = require('../lib/task')

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
        
        --debug - tool debugging output (WIP)
        --destination - output directory
        --module - documentation module name
        --source - source directory
        --verbose - detailed output (WIP)
`
  }

}

module.exports = Docs
