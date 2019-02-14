
/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */

const fs = require('fs'),
      path = require('path'),
      Task = require('../lib/task')

let knownTasks

function createTask(task = 'help') {

  getRegisteredTasks()

  const TaskClass = knownTasks[task.toLowerCase()]
  if (!TaskClass) {
    throw new RangeError(`${task} task does not exist`)
  }
  return new TaskClass()

}

function getRegisteredTasks() {

  if (!knownTasks) {
    knownTasks = fs
      .readdirSync(path.join(__dirname))
      .reduce((tasks, file) => {
        if (file !== 'index.js') {
          const TaskClass = require(path.join(__dirname, file))
          TaskClass.taskNames.forEach((taskName) => {
            tasks[taskName] = TaskClass // eslint-disable-line no-param-reassign
          })
        }
        return tasks
      }, {})
  }
  return Object.assign({}, knownTasks)

}

module.exports = {
  Task,
  createTask,
  getRegisteredTasks
}
