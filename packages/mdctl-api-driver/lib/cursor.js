/* eslint-disable no-param-reassign, max-len, no-restricted-syntax */
const { Transform } = require('stream'),
      pump = require('pump'),
      _ = require('lodash'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      {
        compact, clamp, rBool
      } = require('@medable/mdctl-core-utils/values'),
      sMaxTimeMs = 2000,
      sMinMaxTimeMs = 10,
      sMaxMaxTimeMs = 10000

let Undefined

class BaseCursor extends Transform {

  constructor(cortexObject) {
    super({ objectMode: true })
    Object.assign(privatesAccessor(this), {
      cortexObject,
    })
    this.on('end', () => {
      privatesAccessor(this, 'ended', true)
    })
  }

  // eslint-disable-next-line no-underscore-dangle
  _transform(chunk, enc, cb) {
    this.push(chunk)
    cb()
  }

  get cortexObject() {
    return privatesAccessor(this, 'cortexObject')
  }

  get iterator() {
    return this
  }

  stream(options) {
    return this.cortexObject.driver.cursor(this, this.cortexObject.name, options)
  }

  // ----------------------------------------

  async forEach(fn) {
    return new Promise((resolve, reject) => {
      const t = new Transform({
        objectMode: true,
        transform(chunk, enc, cb) {
          fn(chunk)
          cb()
        }
      }).once('error', reject)
      pump(this, t, () => {
        resolve()
      })
    })
  }

  async map(fn) {
    return new Promise((resolve, reject) => {
      const out = [],
            t = new Transform({
              objectMode: true,
              transform(chunk, enc, cb) {
                out.push(fn(chunk))
                cb()
              }
            }).once('error', reject)
      pump(this, t, () => {
        resolve(out)
      })
    })
  }

  async find(fn) {
    return new Promise((resolve, reject) => {
      let out = null
      const t = new Transform({
        objectMode: true,
        transform(chunk, enc, cb) {
          if (fn(chunk)) {
            out = chunk
            this.destroy()
          }
          cb()
        }
      }).once('error', reject)
      pump(this, t, () => {
        resolve(out)
      })
    })
  }

  async filter(fn) {
    return new Promise((resolve, reject) => {
      const out = [],
            t = new Transform({
              objectMode: true,
              transform(chunk, enc, cb) {
                if (fn(chunk)) {
                  out.push(chunk)
                }
                cb()
              }
            }).once('error', e => reject(e))
      pump(this, t, () => {
        resolve(out)
      })
    })
  }

  async reduce(fn, memo) {
    return new Promise((resolve, reject) => {
      const t = new Transform({
        objectMode: true,
        transform(chunk, enc, cb) {
          memo = fn(memo, chunk)
          cb()
        }
      }).once('error', reject)
      pump(this, t, () => {
        resolve(memo)
      })
    })
  }

  async toArray() {
    return new Promise((resolve, reject) => {
      const buffer = [],
            t = new Transform({
              objectMode: true,
              transform(chunk, enc, cb) {
                buffer.push(chunk)
                cb()
              }
            }).once('error', reject)
      pump(this, t, () => {
        resolve(buffer)
      })
    })
  }

}

class Cursor extends BaseCursor {

  constructor(cortexObject) {
    super(cortexObject)
    Object.assign(privatesAccessor(this), {
      maxTimeMs: sMaxTimeMs,
      skipAcl: null,
      grant: null,
      roles: null,
      access: null,
      crossOrg: null,
      prefix: null,
      strict: null,
      unindexed: null,
      through: null,
      locale: null,
      transform: null
    })
  }

  access(v) {
    privatesAccessor(this, 'access', clamp(v, 1, 8))
    return this
  }

  pathPrefix(v = null) {
    if (v !== null) {
      v = String(v)
    }
    privatesAccessor(this, 'prefix', v)
    return this
  }

  crossOrg(v = true) {
    privatesAccessor(this, 'crossOrg', Boolean(v))
    return this
  }

  strict(v = true) {
    privatesAccessor(this, 'strict', Boolean(v))
    return this
  }

  indexed(v = true) {
    privatesAccessor(this, 'unindexed', !v)
    return this
  }

  engine(v = 'stable') {
    privatesAccessor(this, 'engine', v)
    return this
  }

  explain(explain = true) {
    return this.cortexObject.driver.list(this.cortexObject.name, Object.assign(this.options(), { explain }))
  }

  grant(v = null) {
    privatesAccessor(this, 'grant', v)
    return this
  }

  roles(...roles) {
    privatesAccessor(this, 'roles', roles)
    return this
  }

  limit() {
    throw new Error('script.error.pureVirtual')
  }

  through(v) {
    privatesAccessor(this, 'through', v)
    return this
  }

  maxTimeMS(v) {
    privatesAccessor(this, 'maxTimeMs', clamp(v, sMinMaxTimeMs, sMaxMaxTimeMs))
    return this
  }

  skip() { throw new Error('Pure Virtual') }

  skipAcl(v = true) {
    privatesAccessor(this, 'skipAcl', Boolean(v))
    return this
  }

  sort() { throw new Error('script.error.pureVirtual') }

  toList() {
    return this.cortexObject.driver.list(this.cortexObject.name, this.options())
  }

  locale(v) {
    privatesAccessor(this, 'locale', v)
    return this
  }

  transform(v) {
    privatesAccessor(this, 'transform', v)
    return this
  }

  options() {
    const options = _.clone(privatesAccessor(this))
    delete options.cortexObject
    return {
      ...options
    }
  }

  getOptions() {
    return compact({
      operation: 'cursor',
      object: this.cortexObject.name,
      ...this.options()
    }, Undefined, null)
  }

}


class QueryCursor extends Cursor {

  constructor(cortexObject, where) {
    super(cortexObject)
    Object.assign(privatesAccessor(this), {
      where
    })
  }

  count() {
    return this.cortexObject.driver.count(this.cortexObject.name, this.options())
  }

  stream() {
    return super.stream(this.getOptions())
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

  passive(v = true) {
    privatesAccessor(this, 'passive', Boolean(v))
    return this
  }

  limit(v) {
    privatesAccessor(this, 'limit', v)
    return this
  }

  skip(v) {
    privatesAccessor(this, 'skip', v)
    return this
  }

  sort(v) {
    privatesAccessor(this, 'sort', v)
    return this
  }

  options() {
    const {
      paths, include, expand, passive, where, sort, skip, limit
    } = privatesAccessor(this)
    return Object.assign(super.options(), {
      paths,
      include,
      expand,
      passive,
      where,
      sort,
      skip,
      limit
    })
  }

  toUrl() {

    return [
      ['where', 'where'],
      ['paths', 'paths'],
      ['include', 'include'],
      ['expand', 'expand'],
      ['sort', 'sort'],
      ['skip', 'skip'],
      ['limit', 'limit']
    ]
      /* eslint-disable max-len */
      .filter(v => privatesAccessor(this, v[1]) !== null && privatesAccessor(this, v[1]) !== Undefined)
      .map((v) => {
        const value = privatesAccessor(this, v[1])
        if (!Array.isArray(value) || value.length <= 1) {
          return `${v[0]}=${encodeURIComponent(JSON.stringify(this[v[1]]))}`
        }
        return value
          .filter(v1 => v1 !== null && v1 !== Undefined)
          .reduce((arr, v1) => [...arr, `${v[0]}[]=${encodeURIComponent(v1)}`], [])
          .join('&')
      })
      .join('&')

  }

  toJSON() {
    const {
      paths, include, expand, where, sort, skip, limit
    } = privatesAccessor(this)
    return JSON.stringify({
      where,
      paths,
      include,
      expand,
      sort,
      skip,
      limit
    })
  }

  toString() {
    return this.toJSON()
  }

  pathRead(path, options) {

    options = options || {}
    return this.cortexObject.driver.readOne(this.cortexObject.name, {
      ...this.options(),
      path,
      where: privatesAccessor(this, 'where'),
      throwNotFound: rBool(options.throwNotFound, true)
    })
  }

  execute() {
    return this.cortexObject.driver.cursor(this, this.cortexObject.name, this.options())
  }

  async toArray() {
    await this.execute()
    return super.toArray()
  }

}

// ---------------------------------------------------------------

class AggregationCursor extends Cursor {

  constructor(cortexObject, pipeline) {
    super(cortexObject)
    Object.assign(privatesAccessor(this), {
      pipeline: Array.isArray(pipeline) ? pipeline : []
    })
  }

  execute() {
    return this.cortexObject.driver.cursor(this, this.cortexObject.name, this.options())
  }

  group(v) {
    return this.add('$group', v)
  }

  limit(v) {
    return this.add('$limit', v)
  }

  match(v) {
    return this.add('$match', v)
  }

  project(v) {
    return this.add('$project', v)
  }

  addFields(v) {
    return this.add('$addFields', v)
  }

  native(v) {
    privatesAccessor(this, 'nativePipeline', v)
    return this
  }

  skip(v) {
    return this.add('$skip', v)
  }

  sort(v) {
    return this.add('$sort', v)
  }

  unwind(v) {
    return this.add('$unwind', v)
  }

  add(type = null, v) {
    const { pipeline } = privatesAccessor(this)
    pipeline.push(type ? { [type]: v } : v)
    return this
  }

  options() {
    const { pipeline, nativePipeline } = privatesAccessor(this)
    return Object.assign(super.options(), {
      pipeline,
      nativePipeline
    })
  }

  toUrl() {
    return `pipeline=${encodeURIComponent(JSON.stringify(privatesAccessor(this, 'pipeline')))}`
  }

  toJSON() {
    return JSON.stringify(privatesAccessor(this, 'pipeline'))
  }

  toString() {
    return this.toJSON()
  }

  async toArray() {
    await this.execute()
    return super.toArray()
  }

}

module.exports = {
  QueryCursor,
  AggregationCursor
}
