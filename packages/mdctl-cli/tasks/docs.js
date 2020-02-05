/* eslint-disable class-methods-use-this */

const { Fault } = require('@medable/mdctl-core'),
      Task = require('../lib/task'),
      MdctlDocs = require('@medable/mdctl-docs')

class Docs extends Task {

  constructor() {

    super({})

  }

  async run(cli) {
    return MdctlDocs.generateDocumentation('')
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {

    return 'Medable documentation tool'

  }

  static help() {

    return `
    Medable documentation tool.

    Usage:

      mdctl docs
    `
  }

}

module.exports = Docs
