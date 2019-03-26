
/* eslint-disable  class-methods-use-this */

const Task = require('../lib/task'),
      { getRegisteredTasks } = require('./index'),
      { pad } = require('@medable/mdctl-core-utils/values')

class Help extends Task {

  async run(cli) {

    let taskName = (this.args('1') || '').toLowerCase()
    if (taskName.indexOf('--') === 0) {
      taskName = ''
    }

    const tasks = getRegisteredTasks(),
          task = tasks[taskName],
          taskNames = Object.keys(tasks).sort(),
          padTo = taskNames.reduce((memo, value) => Math.max(memo, value.length), 0)

    if (!taskName) {

      return console.log(`
      Available commands: 
      
        ${taskNames.map(value => `${pad(padTo, value)} - ${tasks[value].synopsis}`).join('\n        ')}
        
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
