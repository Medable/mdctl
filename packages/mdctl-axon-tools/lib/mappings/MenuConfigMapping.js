const getMappingScript = require('./index')

module.exports = class MenuConfigMapping {

  constructor(org) {
    this.org = org
  }

  // WORKAROUND to be backwards compatible with Axon Deployer using this as entry point
  async getMappingScript() {
    return getMappingScript(this.org)
  }

}
