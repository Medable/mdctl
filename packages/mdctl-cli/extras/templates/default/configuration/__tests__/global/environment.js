// my-custom-environment
const NodeEnvironment = require('jest-environment-node')

class CustomEnvironment extends NodeEnvironment {

  async setup() {
    await super.setup()
  }

  async teardown() {
    await super.teardown()
  }

  runScript(script) {
    return super.runScript(script)
  }

  handleTestEvent(event, state) {
  }

}

module.exports = CustomEnvironment