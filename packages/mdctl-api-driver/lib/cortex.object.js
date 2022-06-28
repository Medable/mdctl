
const { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { singularize, pluralize } = require('inflection'),
      Driver = require('./driver'),
      {
        ReadOneOperation,
        InsertOperation,
        InsertManyOperation,
        UpdateOperation,
        UpdateManyOperation,
        DeleteOperation,
        DeleteManyOperation,
        PatchOperation,
        PatchManyOperation,
        BulkOperation
      } = require('./operations'),
      { QueryCursor, AggregationCursor } = require('./cursor')
      // registeredObjects = {},
      // registeredAliases = {}

class CortexObject {

  constructor(objectName, driver) {

    Object.defineProperty(this, 'name', {
      value: objectName.toLowerCase(),
      enumerable: true
    })

    Object.assign(privatesAccessor(this), {
      driver: driver || new Driver()
    })
  }

  /*
  registerObject(name, cls, ...aliases) {
    [name, ...aliases].map(n => n.toLowerCase()).forEach((alias) => {
      this.registeredAliases[alias] = name
    })
    this.registeredObjects[name] = cls
  }
  */

  // eslint-disable-next-line camelcase
  register_object(...args) {
    this.registerObject(...args)
  }

  /**
   * Create a CortexObject class from a name.
   * @param inputName
   * @returns {*}
   */
  static as(inputName, driver) {

    const name = String(inputName).toLowerCase()

    let singular = singularize(name),
        plural = pluralize(name)// ,
        // regName

    if (name !== singular && name !== plural) {
      singular = name
      plural = name
    }
    /*
    regName = this.registeredAliases[singular] // eslint-disable-line prefer-const

    if (regName) {
      const obj = this.registeredObjects[regName]
      obj.driver = driver
      return obj
    }
    */
    // Using this allows subclassing of CortexObject
    // eg. HubObject.as('Namespace')
    // eslint-disable-next-line no-new-func
    privatesAccessor(this, 'driver', driver)

    {
      const cls = new CortexObject(singular, driver)
      // this.register_object(singular, cls, plural)
      return cls
    }

  }

  set driver(driver) {
    privatesAccessor(this, 'driver', driver)
  }

  get driver() {
    return privatesAccessor(this, 'driver')
  }

  aggregate(pipeline = []) {
    if (!Array.isArray(pipeline)) {
      throw new TypeError('aggregate expects array pipeline')
    }
    return new AggregationCursor(this, pipeline)
  }

  count(where) {
    return new QueryCursor(this, where).count()
  }

  deleteMany(match) {
    return new DeleteManyOperation(this, match)
  }

  deleteOne(match) {
    return new DeleteOperation(this, match)
  }

  find(where) {
    const query = new QueryCursor(this, where)
    return query
  }

  readOne(where) {
    return new ReadOneOperation(this, where)
  }

  insertMany(docs = []) {
    return new InsertManyOperation(this, docs)
  }

  insertOne(doc = {}) {
    return new InsertOperation(this, doc)
  }

  updateOne(match, doc) {
    return new UpdateOperation(this, match, doc)
  }

  updateMany(match, doc) {
    return new UpdateManyOperation(this, match, doc)
  }

  patchOne(match, doc) {
    return new PatchOperation(this, match, doc)
  }

  patchMany(match, doc) {
    return new PatchManyOperation(this, match, doc)
  }

}

class Org extends CortexObject {

  constructor(driver) {
    super('org', driver)
    const self = this
    this.objects = new Proxy({
      bulk(...ops) {
        return new BulkOperation(self, ops)
      }
    }, {
      get(target, property) {
        if (property in target) {
          return target[property]
        }
        if (target[property]) {
          return target[property]
        }
        // eslint-disable-next-line no-param-reassign
        target[property] = CortexObject.as(property, driver)
        return target[property]
      }
    })
  }

}


module.exports = {
  CortexObject,
  Org
}
