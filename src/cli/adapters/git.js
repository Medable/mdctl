import EventEmitter from 'events'
import { EVENT_NAMES } from './EventsNames'

class Git {

  constructor(emitter = new EventEmitter()) {
    this.emitter = emitter
    this.startListeners()
  }

  startListeners() {
    this.emitter.on(EVENT_NAMES.ADD_SCRIPT, (data) => {
      // TODO: Add implementation for fileAdaptaer on AddScript
    })
    this.emitter.on(EVENT_NAMES.ADD_RESOURCE, (data) => {
      // TODO: Add implementation for fileAdaptaer on AddResource
    })
  }

}

export default Git
