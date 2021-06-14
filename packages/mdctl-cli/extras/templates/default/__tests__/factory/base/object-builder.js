import _ from 'lodash'

import ObjectInstance from './object-instance'
import { getChildProperty } from './reference-map'

export default class ObjectBuilder {

  static _type() {
    throw new Error('Must be implemented in subclass')
  }

  static defaults() {
    return {}
  }

  static uniqueId() {
    return _.uniqueId(`${this._type()}_${Date.now()}_`)
  }

  // A map of child object types to their reverse reference property
  static childReferences() {
    return {}
  }

  static attachChildBuilders(objectInstance, childReferences, factory) {
    objectInstance.newChild = new Proxy(childReferences, {
      get: (references, objectType) => {
        const childBuilder = factory.new[objectType],
              childProperty = references[objectType]
                ? references[objectType]
                : getChildProperty(this._type(), objectType)

        if (!childProperty) {
          throw new Error(`Could not find child object type ${objectType} in ${this._type()}'s childReferences or in reference map`)
        }
        if (Array.isArray(childProperty)) {
          throw new Error(`Child object typ ${objectType} has multiple references to ${this._type}, must manually build object.`)
        }
        objectInstance.objectMustExistForAction(`create child ${objectType} object`)
        childBuilder.set(childProperty, objectInstance._id)
        return childBuilder
      }
    })
  }

  constructor(client, cleaner, factory) {
    this.objectInstance = new ObjectInstance(
      this.constructor._type(),
      client,
      cleaner
    )
    this.constructor.attachChildBuilders(
      this.objectInstance,
      this.constructor.childReferences(),
      factory
    )
    this.properties = {}

    Object.assign(this.properties, this.constructor.defaults())
  }

  set(property, value) {
    if (value instanceof ObjectInstance) {
      this.properties[property] = value._id
    } else {
      this.properties[property] = value
    }
    return this
  }

  unset(property) {
    delete this.properties[property]
    return this
  }

  async build() {
    this.lastResponse = await this.objectInstance.create(this.properties)
    return this.objectInstance
  }

}

/**

 task.add.step.build()

 */