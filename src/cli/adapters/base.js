const EventEmitter = require('events')
const { privatesAccessor } = require('../../utils/privates')

class BaseAdapter {

  constructor() {
    // noinspection JSAnnotator
    this.adapters = []
    this.emitter = new EventEmitter()
  }

  on(event, callback) {
    this.emitter.on(event, (data) => {
      // Do Something here
      console.debug(`${event} has been called`)
      callback(data)
    })
  }

  emit(event, data) {
    this.emitter.emit(event, data)
  }

}

module.exports = BaseAdapter
