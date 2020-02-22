/**
 * Example Plugin
 */

const { plugin, command } = require('c_mdctl')

@plugin('example', { acl: 'role.developer', environment: '*' })
class ExamplePlugin {

  @command('echo', { environment: '*' })
  static echo(...args) {
    return args
  }

  @command('multiply', { acl: 'role.administrator', environment: 'development' })
  static multiply(number, by = 2) {
    return number * by
  }

}

module.exports = ExamplePlugin
