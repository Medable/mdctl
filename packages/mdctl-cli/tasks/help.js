/* eslint-disable  class-methods-use-this */

const { pad } = require('@medable/mdctl-core-utils/values'),
      Task = require('../lib/task'),
      { getRegisteredTasks } = require('./index')

class Help extends Task {

  async run(cli) {

    let taskName = (cli.args('1') || '').toLowerCase()
    if (taskName.indexOf('--') === 0) {
      taskName = ''
    }

    const tasks = getRegisteredTasks(),
          task = tasks[taskName],
          taskNames = Object.keys(tasks).sort(),
          padTo = taskNames.reduce((memo, value) => Math.max(memo, value.length), 0)

    if (!taskName) {

      const tasksHelps = taskNames.filter((t) => t.indexOf('--') === -1).map((value) => `${pad(padTo, value)} - ${tasks[value].synopsis}`)
      return console.log(`
      Available commands:
      
        ${tasksHelps.join('\n        ')}  
      
      Options:
      
        --version shows client version
        --help shows help

      Type "mdctl help [task]" for command options.
      `)

    }
    if (!task) {

      return console.log(`
      Command "${taskName}" does not exist.

      Type "mdctl help" for a list of available commands.
      `)

    }

    return console.log(task.help(cli))

  }

  static get taskNames() {
    return ['help', '--help']
  }

  static get synopsis() {
    return 'displays help'
  }

  static help() {
    return `
            /((((((\\\\\\\\
   =======((((((((((\\\\\\\\\\
         ((           \\\\\\\\\\\\\\
         ( (*    _/      \\\\\\\\\\\\\\
           \\    /  \\      \\\\\\\\\\\\
            |  |   |
            o_|   /
    `
  }

}

module.exports = Help
