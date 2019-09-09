/* eslint-disable max-len */
const { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      {
        clamp, isSet, isString, compact
      } = require('@medable/mdctl-core-utils/values'),
      sMaxTimeMs = 2000,
      sMinMaxTimeMs = 10,
      sMaxMaxTimeMs = 10000,
      WRAPPER_OPTIONS = ['name', 'halt', 'wrap', 'output', 'as']

let Undefined

class Operation {

  constructor(cortexObject) {
    Object.assign(privatesAccessor(this), {
      skipAcl: null,
      through: null,
      grant: null,
      roles: null,
      crossOrg: null,
      dryRun: null,
      passive: null,
      locale: null,
      cortexObject
    })
  }

  get cortexObject() {
    return privatesAccessor(this, 'cortexObject')
  }

  skipAcl(v = true) {
    privatesAccessor(this, 'skipAcl', Boolean(v))
    return this
  }

  through(v = '') {
    privatesAccessor(this, 'through', String(v))
    return this
  }

  grant(v = null) {
    privatesAccessor(this, 'grant', v)
    return this
  }

  roles(...roles) {
    privatesAccessor(this, 'roles', roles)
    return this
  }

  crossOrg(v = true) {
    privatesAccessor(this, 'crossOrg', Boolean(v))
    return this
  }

  dryRun(v = true) {
    privatesAccessor(this, 'dryRun', Boolean(v))
    return this
  }

  passive(v = true) {
    privatesAccessor(this, 'passive', Boolean(v))
    return this
  }

  locale(v) {
    privatesAccessor(this, 'locale', v)
    return this
  }

  options() {
    const {
      skipAcl, grant, roles, crossOrg, dryRun, through, passive, locale
    } = privatesAccessor(this)
    return {
      skipAcl, grant, roles, crossOrg, dryRun, through, passive, locale
    }
  }

  get opName() {
    return ''
  }

  getOptions() {
    const { cortexObject } = privatesAccessor(this)
    return compact({
      object: cortexObject.name,
      operation: this.opName,
      ...this.options()
    }, Undefined, null)
  }

}

class ReadOneOperation extends Operation {

  constructor(cortexObject, where) {
    super(cortexObject)
    Object.assign(privatesAccessor(this), {
      throwNotFound: true,
      maxTimeMs: sMaxTimeMs,
      where
    })
  }

  where(where) {
    privatesAccessor(this, 'where', where)
    return this
  }

  expand(v, ...more) {
    privatesAccessor(this, 'expand', Array.isArray(v) ? v : [v].concat(more))
    return this
  }

  paths(v, ...more) {
    privatesAccessor(this, 'paths', Array.isArray(v) ? v : [v].concat(more))
    return this
  }

  include(v, ...more) {
    privatesAccessor(this, 'include', Array.isArray(v) ? v : [v].concat(more))
    return this
  }

  sort(v) {
    privatesAccessor(this, 'sort', v)
    return this
  }

  path(v = '') {
    privatesAccessor(this, 'path', v)
    return this
  }

  throwNotFound(v = true) {
    privatesAccessor(this, 'throwNotFound', Boolean(v))
    return this
  }

  engine(v = 'stable') {
    privatesAccessor(this, 'engine', String(v))
    return this
  }

  explain(v = true) {
    privatesAccessor(this, 'explain', Boolean(v))
    return this
  }

  maxTimeMS(v) {
    privatesAccessor(this, 'maxTimeMs', clamp(v, sMinMaxTimeMs, sMaxMaxTimeMs))
    return this
  }

  options() {
    return {
      ...super.options(),
      ...privatesAccessor(this)
    }
  }

  execute() {
    // here call the driver api
    return this.cortexObject.driver.readOne(this.cortexObject.name, this.getOptions())
  }

  getOptions() {
    return compact({
      ...this.options()
    }, Undefined, null)
  }

  get opName() {
    return 'readOne'
  }

}

class WriteOneOperation extends Operation {

  constructor(cortexObject) {
    super(cortexObject)
    privatesAccessor(this, {
      paths: null,
      include: null,
      lean: true
    })
  }

  paths(v, ...more) {
    privatesAccessor(this, 'paths', Array.isArray(v) ? v : [v].concat(more))
    privatesAccessor(this, 'lean', false)
    return this
  }

  include(v, ...more) {
    privatesAccessor(this, 'include', Array.isArray(v) ? v : [v].concat(more))
    privatesAccessor(this, 'lean', false)
    return this
  }

  lean(v = true) {
    privatesAccessor(this, 'lean', v === 'modified' ? v : Boolean(v))
    return this
  }

  options() {
    const { paths, include, lean } = privatesAccessor(this)
    return {
      ...super.options(),
      paths,
      include,
      lean
    }
  }

}

class InsertOperation extends WriteOneOperation {

  constructor(cortexObject, document) {
    super(cortexObject)
    Object.assign(privatesAccessor(this), {
      document,
      bypassCreateAcl: null
    })
  }

  bypassCreateAcl(v = true) {
    privatesAccessor(this, 'bypassCreateAcl', Boolean(v))
    return this
  }

  options() {
    return {
      ...super.options(),
      bypassCreateAcl: privatesAccessor(this, 'bypassCreateAcl')
    }
  }

  execute() {
    return this.cortexObject.driver.insertOne(this.cortexObject.name, this.getOptions())
  }

  getOptions() {
    const { document } = privatesAccessor(this)
    return compact({
      document,
      ...super.getOptions()
    }, Undefined, null)
  }

  get opName() {
    return 'insertOne'
  }

}

class InsertManyOperation extends Operation {

  constructor(cortexObject, document = []) {
    super(cortexObject)
    Object.assign(privatesAccessor(this), {
      documents: Array.isArray(document) ? document : [document],
      bypassCreateAcl: null
    })
  }

  bypassCreateAcl(v = true) {
    privatesAccessor(this, 'bypassCreateAcl', Boolean(v))
    return this
  }

  options() {
    return {
      ...super.options(),
      bypassCreateAcl: privatesAccessor(this, 'bypassCreateAcl')
    }
  }

  execute() {
    return this.cortexObject.driver.insertMany(this.cortexObject.name, this.getOptions())
  }

  getOptions() {
    const { documents } = privatesAccessor(this)
    return compact({
      documents,
      ...super.getOptions()
    }, Undefined, null)
  }

  get opName() {
    return 'insertMany'
  }

}

class PatchOperation extends WriteOneOperation {

  constructor(cortexObject, match, ops) {
    super(cortexObject)
    Object.assign(privatesAccessor(this), {
      match,
      ops,
      path: null,
      mergeDocuments: false
    })
  }

  options() {
    const { path, through, mergeDocuments } = privatesAccessor(this)
    if (path && through) {
      throw new TypeError('through() and pathPrefix cannot be used together.')
    }

    return {
      ...super.options(),
      path,
      mergeDocuments
    }
  }

  merge(v = true) {
    privatesAccessor(this, 'mergeDocuments', Boolean(v))
    return this
  }

  pathPrefix(v = null) {
    const { lean } = privatesAccessor(this)
    if (v !== null) {
      /* eslint-disable no-param-reassign */
      v = String(v)
    }
    if (lean === null) {
      privatesAccessor(this, 'lean', false)
    }
    privatesAccessor(this, 'path', v)
    return this
  }

  execute() {
    return this.cortexObject.driver.patchOne(this.cortexObject.name, this.getOptions())
  }

  getOptions() {
    const { match, ops } = privatesAccessor(this)
    return compact({
      match,
      ops,
      ...super.getOptions()
    }, Undefined, null)
  }

  get opName() {
    return 'patchOne'
  }

}

class PatchManyOperation extends Operation {

  constructor(cortexObject, match, ops = null) {
    super(cortexObject)
    Object.assign(privatesAccessor(this), {
      match: ops === null ? {} : match,
      ops: ops || match,
      limit: null,
      mergeDocuments: false
    })
  }

  limit(v) {
    privatesAccessor(this, 'limit', v)
    return this
  }

  merge(v = true) {
    privatesAccessor(this, 'merge', Boolean(v))
    return this
  }

  options() {
    const { limit, mergeDocuments } = privatesAccessor(this)
    return {
      ...super.options(),
      limit,
      mergeDocuments
    }
  }

  execute() {
    return this.cortexObject.driver.patchMany(this.cortexObject.name, this.getOptions())
  }

  getOptions() {
    const { match, ops } = privatesAccessor(this)
    return compact({
      match,
      ops,
      ...super.getOptions()
    }, Undefined, null)
  }

  get opName() {
    return 'patchMany'
  }

}

class UpdateOperation extends WriteOneOperation {

  constructor(cortexObject, match, document) {
    super(cortexObject)
    Object.assign(privatesAccessor(this), {
      match,
      document,
      path: null,
      mergeDocuments: false
    })
  }

  options() {
    const { path, through, mergeDocuments } = privatesAccessor(this)
    if (path && through) {
      throw new TypeError('through() and pathPrefix cannot be used together.')
    }

    return {
      ...super.options(),
      path,
      mergeDocuments
    }
  }

  merge(v = true) {
    privatesAccessor(this, 'mergeDocuments', Boolean(v))
    return this
  }

  pathPrefix(v = null) {
    const { lean } = privatesAccessor(this)
    if (v !== null) {
      v = String(v)
    }
    if (lean === null) {
      privatesAccessor(this, 'lean', false)
    }
    privatesAccessor(this, 'path', v)
    return this
  }

  pathDelete(path = null) {
    if (path !== null) {
      this.pathPrefix(path)
    }
    const { match } = privatesAccessor(this)
    return this.cortexObject.driver.delete(this.cortexObject.name, match, this.getOptions())
  }

  pathUpdate(path = null, body = null) {
    if (typeof path !== 'string') {
      body = path
      path = null
    }
    if (path !== null) {
      this.pathPrefix(path)
    }
    const { match } = privatesAccessor(this)
    return this.cortexObject.driver.update(
      this.cortexObject.name,
      match,
      body,
      this.getOptions()
    )
  }

  pathPush(path = null, body = null) {
    if (typeof path !== 'string') {
      body = path
      path = null
    }
    if (path !== null) {
      this.pathPrefix(path)
    }
    const { match } = privatesAccessor(this)
    return this.cortexObject.driver.push(this.cortexObject.name, match, body, this.getOptions())
  }

  pathPatch(path = null, body = null) {
    if (typeof path !== 'string') {
      body = path
      path = null
    }
    if (path !== null) {
      this.pathPrefix(path)
    }
    const { match } = privatesAccessor(this)
    return this.cortexObject.driver.patch(this.cortexObject.name, match, body, this.getOptions())
  }

  execute() {
    return this.cortexObject.driver.updateOne(this.cortexObject.name, this.getOptions())
  }

  getOptions() {
    const { document, match } = privatesAccessor(this)
    return compact({
      match,
      update: document,
      ...super.getOptions()
    }, Undefined, null)
  }

  get opName() {
    return 'updateOne'
  }

}

class UpdateManyOperation extends Operation {

  constructor(cortexObject, match, document = null) {
    super(cortexObject)
    Object.assign(privatesAccessor(this), {
      match: document === null ? {} : match,
      document: document || match,
      limit: null,
      mergeDocuments: false
    })
  }

  limit(v) {
    privatesAccessor(this, 'limit', v)
    return this
  }

  merge(v = true) {
    privatesAccessor(this, 'mergeDocuments', Boolean(v))
    return this
  }

  options() {
    const { limit, mergeDocuments } = privatesAccessor(this)
    return {
      ...super.options(),
      limit,
      mergeDocuments
    }
  }

  execute() {
    return this.cortexObject.driver.updateMany(this.cortexObject.name, this.getOptions())
  }

  getOptions() {
    const { match, document } = privatesAccessor(this)
    return compact({
      match,
      update: document,
      ...super.getOptions()
    }, Undefined, null)
  }

  get opName() {
    return 'updateMany'
  }

}

class DeleteOperation extends Operation {

  constructor(cortexObject, match) {
    super(cortexObject)
    privatesAccessor(this, 'match', match)
  }

  options() {
    return {
      ...super.options()
    }
  }

  execute() {
    return this.cortexObject.driver.deleteOne(this.cortexObject.name, this.getOptions())
  }

  getOptions() {
    const { match } = privatesAccessor(this)
    return compact({
      match,
      ...this.options()
    }, Undefined, null)
  }

  get opName() {
    return 'deleteOne'
  }

}

class DeleteManyOperation extends DeleteOperation {

  constructor(cortexObject, match) {
    super(cortexObject, match)
    privatesAccessor(this, 'limit', null)
  }

  limit(v) {
    privatesAccessor(this, 'limit', v)
    return this
  }

  options() {
    const { limit } = privatesAccessor(this)
    return {
      ...super.options(),
      limit
    }
  }

  execute() {
    return this.cortexObject.driver.deleteMany(this.cortexObject.name, this.getOptions())
  }

  get opName() {
    return 'deleteMany'
  }

}

class BulkOperationWrapper {

  constructor(bulk, operation, options = {}) {

    Object.assign(privatesAccessor(this), {
      bulk,
      operation
    })

    if (isSet(options)) {
      WRAPPER_OPTIONS.forEach((prop) => {
        if (isSet(options[prop])) {
          this[prop](options[prop])
        }
      })
    }

  }

  name(v = '') {
    privatesAccessor(this, 'name', String(v))
    return this
  }

  halt(v = true) {
    privatesAccessor(this, 'halt', Boolean(v))
    return this
  }

  wrap(v = true) {
    privatesAccessor(this, 'wrap', Boolean(v))
    return this
  }

  output(v = true) {
    privatesAccessor(this, 'output', Boolean(v))
    return this
  }

  as(id, options = {}) {
    if (isString(id)) {
      privatesAccessor(this, 'as', { id, ...(options || {}) })
    } else if (isSet(id)) {
      privatesAccessor(this, 'as', id)
    }
    return this
  }

  get bulk() {
    return privatesAccessor(this, 'bulk')
  }

  get operation() {
    return privatesAccessor(this, 'operation')
  }

  getOptions() {
    const {
      name, halt, wrap, output, as
    } = privatesAccessor(this)
    return compact({
      name,
      halt,
      wrap,
      output,
      as,
      ...this.operation.getOptions()
    }, Undefined)
  }

}

class BulkOperation extends Operation {

  constructor(cortexObject) {
    super(cortexObject)
    Object.assign(privatesAccessor(this), {
      ops: [],
      transform: null
    })
  }

  add(operation, options) {
    const { ops } = privatesAccessor(this),
          wrapped = new BulkOperationWrapper(this, operation, options)
    ops.push(wrapped)
    return this

  }

  transform(v) {
    privatesAccessor(this, 'transform', v)
    return this
  }

  execute() {
    return this.cortexObject.driver.bulk(this.cortexObject.name, this.getOptions())
  }

  options() {
    return {
      ops: this.bulkOps(),
      transform: privatesAccessor(this, 'transform')
    }
  }

  bulkOps() {
    const { ops } = privatesAccessor(this)
    return ops.map(op => op.getOptions())
  }

  getOptions() {
    return compact({
      operation: 'bulk',
      ...this.options()
    }, Undefined, null)
  }

}

module.exports = {
  ReadOneOperation,
  InsertOperation,
  InsertManyOperation,
  PatchOperation,
  PatchManyOperation,
  UpdateOperation,
  UpdateManyOperation,
  DeleteOperation,
  DeleteManyOperation,
  BulkOperation
}
