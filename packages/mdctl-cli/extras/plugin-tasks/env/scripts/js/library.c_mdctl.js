/**
 * MDCTL companion cortex plugin library.
 *
 * @author James Sas <james@medable.com>
 *
 * Adds a series of runtime routes that, when used in conjunction with @plugin/@command decorators and entries
 * into a c_mdctl_plugins config key, integrates mdctl commands with the back end.
 *
 */

/* global script, consts */

const { route } = require('decorators'),
      { decorate, isDescriptor } = require('decorator-utils'),
      {
        array: toArray, rString, isFunction, matchesEnvironment, isSet
      } = require('util.values'),
      { equalIds } = require('util.id'),
      registered = new Map(),
      classes = new Map(),
      config = require('config'),
      symCommands = Symbol('commands')

let Undefined

function aclParts(entry) {

  const path = String(entry),
        dot = path.indexOf('.'),
        prefix = dot !== -1 ? path.substr(0, dot) : path,
        suffix = dot !== -1 ? path.substr(dot + 1) : Undefined

  return [prefix || Undefined, suffix || Undefined]

}

class RegisteredCommand {

  constructor({
    name: commandName, methodName, acl = ['role.administrator'], description = '', environment = '*', isStatic
  } = {}) {
    this.name = commandName
    this.methodName = methodName
    this.acl = toArray(acl, !!acl).map((v) => {
      const [type, name] = aclParts(v)
      return { type, name }
    })
    this.description = description
    this.environment = environment
    this.isStatic = isStatic
  }

  hasAccess(principal) {
    return this.acl.some(({ type, name }) => {
      if (type === 'role') {
        if (principal.hasRole(consts.roles[name])) {
          return true
        }
      } else if (type === 'account') {
        if (principal.email === name || equalIds(principal._id, name)) {
          return true
        }
      }
      return false
    })
  }

  toJSON(principal) {
    if (this.hasAccess(principal)) {
      const {
        name, acl, description, environment
      } = this
      return {
        name, acl, description, environment
      }
    }
    return null
  }

}

class RegisteredPlugin {

  constructor(Class, {
    name: pluginName, acl = ['role.administrator'], description = '', environment = '*'
  } = {}) {
    this.Class = Class
    this.commands = new Map()
    this.name = pluginName
    this.acl = toArray(acl, !!acl).map((v) => {
      const [type, name] = aclParts(v)
      return { type, name }
    })
    this.description = description
    this.environment = environment
  }

  addCommand(name, options = {}) {
    this.commands.set(name, new RegisteredCommand(options))
  }

  getCommand(name) {
    return this.commands.get(name)
  }

  hasAccess(principal) {
    return this.acl.some(({ type, name }) => {
      if (type === 'role') {
        if (principal.hasRole(consts.roles[name])) {
          return true
        }
      } else if (type === 'account') {
        if (principal.email === name || equalIds(principal._id, name)) {
          return true
        }
      }
      return false
    })
  }

  toJSON(principal) {

    if (this.hasAccess(principal)) {
      const {
              name, acl, description, environment
            } = this,
            commands = Array.from(this.commands.values()).reduce(
              (list, command) => {
                const json = command.toJSON(principal)
                if (json) {
                  list.push(json)
                }
                return list
              },
              []
            )

      if (commands.length) {
        return {
          name, acl, description, environment, commands
        }
      }
    }

    return null

  }

}

class PluginApi { // eslint-disable-line no-unused-vars

  @route('GET mdctl', { acl: 'account.public' })
  static 'route@list'() {

    this.load()

    return Array.from(registered.values()).reduce(
      (list, plugin) => {
        const json = plugin.toJSON(script.principal)
        if (json) {
          list.push(json)
        }
        return list
      },
      []
    )

  }

  @route('GET mdctl/:plugin', { acl: 'account.public' })
  static 'route@get'(runtime) {

    this.load(runtime.req.params.plugin)

    const { req: { params: { plugin: pluginParam } }, next } = runtime,
          plugin = registered.get(pluginParam),
          json = plugin && plugin.toJSON(script.principal)

    return json || next()

  }

  @route('POST mdctl/:plugin/:command', { acl: 'account.public' })
  static 'route@run'(runtime) {

    this.load(runtime.req.params.plugin)

    const { req: { params: { plugin: pluginParam, command: commandParam } }, next, body } = runtime,
          { principal } = script,
          plugin = registered.get(pluginParam),
          command = plugin && plugin.getCommand(commandParam),
          { Class } = plugin || {},
          { methodName } = command || {},
          ok = command && plugin.hasAccess(principal) && command.hasAccess(principal),
          instance = ok && (command.isStatic ? Class : new Class()),
          args = ok && toArray(body())

    if (!ok) {

      return next()

    }

    return instance[methodName](...args)

  }

  /**
   * In userland, the route is the only runtime we have, so load plugins on the fly.
   *
   * @param pluginName
   */
  static load(pluginName = Undefined) {

    const pluginConfig = config('c_mdctl_plugins') || {},
          exports = isSet(pluginName)
            ? [pluginConfig[pluginName]]
            : Object.keys(pluginConfig).map((name) => pluginConfig[name])

    exports.forEach((scriptExport) => {
      if (scriptExport) {
        try {
          require(scriptExport) // eslint-disable-line global-require, import/no-dynamic-require
        } catch (err) {
          // noop
        }
      }
    })

  }

}

/**
 * mdctl plugin decorator
 */

function pluginDecorator(...decoratorParams) {

  function initialize(Class, ...params) {

    let options,
        name

    if (typeof params[0] === 'string') {
      name = rString(params[0])
      options = Object.assign(params[1] || {}, { name })
    } else {
      options = params[0] || {}
      name = rString(options.name)
    }

    if (!name) {
      throw Fault.create('script.invalidArgument.unspecified', { reason: `Class "${Class.prototype.name}" @plugin must have a name property.` })
    } else if (registered.has(name)) {
      throw Fault.create('script.invalidArgument.unspecified', { reason: `Class "${Class.prototype.name}" @plugin has a duplicate.` })
    }

    const { environment, acl } = options

    if (matchesEnvironment(environment)) {

      const plugin = new RegisteredPlugin(Class, options),
            commands = Class[symCommands] || []

      classes.set(Class, name)
      registered.set(name, plugin)

      commands.forEach(({ methodName, isStatic, commandParams }) => {

        let commandOptions,
            commandName

        if (typeof commandParams[0] === 'string') {
          commandName = rString(commandParams[0])
          commandOptions = Object.assign(commandParams[1] || {}, { name: commandName })
        } else {
          commandOptions = commandParams[0] || {}
          commandOptions.name = rString(commandOptions.name, methodName)
          commandName = commandOptions.name
        }

        if (matchesEnvironment(commandOptions.environment)) {
          plugin.addCommand(commandName, {
            acl, ...commandOptions, methodName, isStatic
          })
        }


      })


    }

  }

  const DecoratedClass = decoratorParams[0]
  if (decoratorParams.length === 1 && isFunction(DecoratedClass)) {
    return initialize(DecoratedClass, DecoratedClass.name, {})
  }
  return decorate(
    (Class, args, descriptor) => {
      if (descriptor && typeof descriptor.value === 'function') {
        throw new TypeError('@plugin can only be used on class declarations')
      }
      initialize(Class, ...args)
    },
    decoratorParams
  )


}

/**
 * mdctl task command decorator
 */
function commandDecorator(...decoratorParams) {

  function initialize(Class, methodName, descriptor, commandParams) {
    const isStatic = !!Class.name,
          PluginClass = isStatic ? Class : Class.constructor,
          commands = PluginClass[symCommands] || (PluginClass[symCommands] = [])

    commands.push({ methodName, isStatic, commandParams: toArray(commandParams) })
    return descriptor
  }

  if (isDescriptor(decoratorParams[decoratorParams.length - 1])) {
    return initialize(...decoratorParams)
  }
  return decorate(initialize, decoratorParams)

}

module.exports = {
  plugin: pluginDecorator,
  command: commandDecorator
}
