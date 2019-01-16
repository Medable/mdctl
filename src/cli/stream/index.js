const EventEmitter = require('events'),
      glob = require('glob'),
      path = require('path'),
      _ = require('lodash')

class StreamAdapter extends EventEmitter {

  constructor(blob, options) {
    super()
    this.options = Object.assign({
      format: 'json'
    }, options)
    this.blob = blob
    this.outputs = []
    this.adapters = []
    this.loadAdapters()
  }

  addOutputList(outputs) {
    this.outputs = outputs
  }

  addOutput(output) {
    this.outputs.push(output)
  }

  loadAdapters() {
    glob.sync(`${__dirname}/adapters/*_adapter.js`).forEach((file) => {
      this.adapters.push(require(path.resolve(file)))
    })
  }

  static get output() {
    return {
      FILE: 'saveToFile',
      MEMORY: 'saveToMemory',
      CONSOLE: 'outputConsole'
    }
  }

  async save() {
    const promises = []
    this.outputs.forEach((o) => {
      _.filter(this.adapters, adapter => adapter.layout === o).forEach((adapterModule) => {
        const adapterInstance = new adapterModule.adapter(this.blob, this.options.format, this)
        promises.push(adapterInstance.save())
      })
    })
    const results = await Promise.all(promises).then(result => result)
    return results
  }

}

module.exports = StreamAdapter
