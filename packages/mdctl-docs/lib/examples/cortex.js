/* eslint-disable */

/**
 * Cortex class module
 * @module classModule
 */

/**
 * @memberof classModule
 */
class Class {

  /**
   * Creates a new Class instance
   *
   * ```
   * const instance = new Class(options)
   * ```
   * @param {Object} options - instance options
   * @returns {Class} a Class instance
   */
  constructor(options) {
    this.options = options
  }

  /**
   * Returns arguments as array
   * @param {string} [arg.arg1=1] - the first argument
   * @param {number} [arg.arg2=2] - the second argument
   * @param {Array} return.args - an array containing both arguments
   */
  static makeArray(arg1 = '1', arg2 = 2) {
    return [arg1, arg2]
  }

  /**
   * Returns arguments as object
   * @param {string} [arg.arg1=1] - the first argument
   * @param {number} [arg.arg2=2] - the second argument
   * @param {Object} return.obj - an object containing both arguments
   */
  makeObject(arg1 = '1', arg2 = 2) {
    return { arg1, arg2 }
  }

}

/**
 * @memberof classModule
 * @extends Class
 */
class ExtendedClass extends Class {

  /**
   * Creates a new ExtendedClass instance
   *
   * ```
   * const instance = new ExtendedClass(options)
   * ```
   * @param {Object} options - instance options
   * @returns {ExtendedClass} an ExtendedClass instance
   */
  constructor(options) {
    super(options)
  }

  /**
   * Returns arguments as array
   * @param {string} [arg.arg1=1] - the first argument
   * @param {number} [arg.arg2=2] - the second argument
   * @param {Array} return.args - an array containing both arguments
   */
  static makeArray(arg1 = '1', arg2 = 2) {
    return [arg1, arg2]
  }

  /**
   * Returns arguments as object
   * @param {string} [arg.arg1=1] - the first argument
   * @param {number} [arg.arg2=2] - the second argument
   * @param {Object} return.obj - an object containing both arguments
   */
  makeObject(arg1 = '1', arg2 = 2) {
    return { arg1, arg2 }
  }

}

const pass = (req, res, next) => next(),

      middleware = Object.freeze({
        first: pass,
        second: pass,
      })

/**
 * Cortex route module
 * @module routeModule
 */
function routeModule(express, router) {
  /**
   * Creates a new resource
   *
   * @route {post} /resources/:resource_id
   * @memberof routeModule
   *
   * @param {string} [query.token] - Authentication token
   *
   * @param {string} path.resource_id - Resource ID
   *
   * @param {Object} body.resource - Resource object
   * @param {boolean} body.resource.name - Resource name
   *
   * @param {string} [header.authorization] - Authorization header
   *
   * @param {Object} response.resource - Resource object
   * @param {string} response.resource.id - Resource ID
   * @param {string} response.resource.name - Resource name
   * @param {Object} response.resource.data - Resource data
   * @param {boolean} [response.resource.data.shouldDocument=true] - Indicator that the resource should be documented
   *
   * @tab mdctl-cli
   * ```bash
   * mdctl
   * ```
   *
   * @tab javascript
   * ```javascript
   * request({
   *   url: /resources/123,
   *   method: 'POST',
   *   body: {
   *     resource: {
   *       name: 'primary'
   *     }
   *   },
   *   params: {
   *     type: '12345abc'
   *   },
   *   qs: {
   *     token: 'abc'
   *   },
   *   headers: {
   *     'Authorization': 'Bearer abc'
   *   }
   * })
   * ```
   */
  const resourcesPost = [
    '/resources/:resource_id',
    middleware.first,
    middleware.second,
    (req, res, next) => res.end(true),
  ]

  /**
   * (This comment is not captured unfortunately)
   */
  router.post(...resourcesPost)
}
