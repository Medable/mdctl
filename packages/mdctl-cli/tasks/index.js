/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */

const fs = require('fs'),
      os = require('os'),
      path = require('path'),
      { version } = require('../package.json'),
      Task = require('../lib/task')

let knownTasks,
    knownTaskNames

async function createTask(cli, task = 'help') {

  let TaskClass = getTask(task.toLowerCase())

  if (!TaskClass) {

    const Plugin = getTask('plugin'),
          plugin = new Plugin()

    await cli.configure()

    TaskClass = await plugin.createTask(cli, task)

    if (!TaskClass) {
      throw new RangeError(`${task} task does not exist`)
    }
  }
  return new TaskClass()
}

function loadTaskNames() {

  if (!knownTaskNames) {

    const configureFile = path.join(os.homedir(), '.medable', 'mdctl.tasks.json')
    try {
      const { version: cachedVersion, knownTaskNames: cachedKnownTaskNames } = JSON.parse(fs.readFileSync(configureFile, 'utf8'))
      if (cachedVersion === version) {
        knownTaskNames = cachedKnownTaskNames
      }
    } catch (err) {
      // noop
    }

    if (!knownTaskNames) {

      knownTaskNames = fs
        .readdirSync(path.join(__dirname))
        .reduce((tasks, file) => {
          if (file !== 'index.js') {
            const TaskClass = require(path.join(__dirname, file))
            TaskClass.taskNames.forEach((taskName) => {
              tasks[taskName] = file // eslint-disable-line no-param-reassign
            })
          }
          return tasks
        }, {})

      try {
        JSON.stringify(fs.writeFileSync(configureFile, JSON.stringify({ version, knownTaskNames }, null, 2), 'utf8'))
      } catch (err) {
        // noop
      }
    }
  }

  return { ...knownTaskNames }
}

function getTask(task) {

  const taskFile = loadTaskNames()[task.toLowerCase()]
  return taskFile && require(path.join(__dirname, taskFile))
}

function getRegisteredTasks() {

  if (!knownTasks) {
    knownTasks = Object.entries(loadTaskNames()).reduce((tasks, [taskName, file]) => {
      tasks[taskName] = require(path.join(__dirname, file)) // eslint-disable-line no-param-reassign
      return tasks
    }, {})
  }

  return { ...knownTasks }

}

module.exports = {
  Task,
  createTask,
  getRegisteredTasks
}
