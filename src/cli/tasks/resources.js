const Client = require('../../lib/api/client'),
      Environment = require('../../lib/api/environment'),
      Task = require('../lib/task')

class Resources extends Task {

  async run(cli) {

    const arg1 = cli.args('1'),
      handler = `add@${arg1}`

    if (!isSet(arg1)) {
      return console.log(Credentials.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }
    return this[handler](cli)

  }
}
