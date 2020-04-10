
const jsonwebtoken = require('jsonwebtoken'),
      { URL } = require('universal-url'),
      { pathTo } = require('@medable/mdctl-core-utils'),
      {
        isSet, rBool, rString
      } = require('@medable/mdctl-core-utils/values'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Config } = require('@medable/mdctl-core/config'),
      { Fault } = require('@medable/mdctl-core'),
      { Secret } = require('@medable/mdctl-secrets'),
      Environment = require('@medable/mdctl-core/credentials/environment'),
      { EventEmitter } = require('events'),
      Primus = require('primus'),
      Emitter = require('primus-emitter'),

      Socket = Primus.createSocket({
        transformer: 'websockets',
        plugin: {
          emitter: Emitter
        }
      }),
      socketDefaults = {
        reconnect: {
          retries: Infinity
        }
      },
      reservedMessages = [
        'open', 'close', 'end', 'timeout',
        'online', 'offline',
        'data', 'error',
        'reconnect', 'reconnected', 'reconnect scheduled', 'reconnect timeout', 'reconnect failed'
      ]

class WsCredentials extends Secret {

  constructor(input) {

    const options = isSet(input) ? input : {},
          jwt = rString(options.token) && jsonwebtoken.decode(options.token),
          environment = jwt && new Environment(jwt.aud),
          username = jwt && rString(jwt['cortex/eml'], '')

    if (!jwt) {
      throw new TypeError('Invalid jwt token credentials.')
    }
    super('token', environment, username, jwt.iss, options.token)
  }

  get token() {
    return this.password
  }

}


class WsClient extends EventEmitter {

  constructor(input) {

    super(input)

    const options = Object.assign({}, isSet(input) ? input : {}),
          privates = privatesAccessor(this)

    Object.assign(privates, {

      transport: {
        rejectUnauthorized: rBool(options.strictSSL, Config.global.client.strictSSL)
      },

      // environment endpoint
      endpoint: '',

      // jwt credentials
      credentials: null,

      // socket
      socket: null

    })

    this.endpoint = options.endpoint
    this.token = options.token

  }

  wsOn(type, listener) {

    if (!reservedMessages.includes(type)) {
      this.socket.on(type, listener)
    }
    return this
  }

  wsOff(type, listener) {

    if (!reservedMessages.includes(type)) {
      this.socket.removeListener(type, listener)
    }
    return this
  }

  on(type, listener) {
    return this.addListener(type, listener)
  }

  addListener(type, listener) {
    super.addListener(type, listener)
    return this.wsOn(type, listener)
  }

  prependListener(type, listener) {
    super.prependListener(type, listener)
    return this.wsOn(type, listener)
  }

  removeListener(type, listener) {
    super.removeListener(type, listener)
    return this.wsOff(type, listener)
  }

  removeAllListeners(type) {
    super.removeAllListeners(type)
    const { socket } = this
    socket.eventNames().forEach((eventName) => {
      if (!reservedMessages.includes(eventName)) {
        socket.removeAllListeners(eventName)
      }
    })
  }

  // ------------------------------

  get strictSSL() {
    return privatesAccessor(this).transport.strictSSL
  }

  set strictSSL(strictSSL) {
    const { transport, socket } = privatesAccessor(this)
    transport.strictSSL = Boolean(strictSSL)
    if (socket) {
      socket.transport = transport
    }
  }

  get credentials() {
    return privatesAccessor(this).credentials
  }

  get token() {
    const { credentials } = privatesAccessor(this)
    return credentials && credentials.token
  }

  set token(token) {
    const privates = privatesAccessor(this)
    privates.credentials = token ? new WsCredentials({ token }) : null
    privates.transport.headers = {
      Authorization: `Bearer ${token}`
    }
  }

  get endpoint() {
    const { endpoint } = privatesAccessor(this)
    return endpoint && endpoint.toString()
  }

  set endpoint(endpoint) {

    const privates = privatesAccessor(this)
    privates.endpoint = endpoint ? new URL('', endpoint) : ''
    if (privates.socket) {
      privates.socket.url = this.endpoint
    }
  }

  // ------------------------------

  get connected() {
    const privates = privatesAccessor(this)
    if (privates.socket) {
      return this.socket.readyState === Primus.OPEN
    }
    return true
  }

  open() {
    this.socket.open()
    return this
  }

  close() {

    try {
      const { socket } = privatesAccessor(this)
      if (socket) {
        socket.end()
      }
    } catch (err) {
      // noop
    }
    return this
  }

  // low-level socket access
  get socket() {

    const privates = privatesAccessor(this),
          { transport } = privates

    let { socket } = privates

    if (!socket) {

      socket = new Socket(
        this.endpoint,
        {
          ...socketDefaults,
          manual: true,
          transport
        }
      )

      socket.on('open', () => this.emit('open'))
      socket.on('close', () => this.emit('close'))
      socket.on('end', () => this.emit('end'))
      socket.on('timeout', () => this.emit('timeout'))
      socket.on('online', () => this.emit('online'))
      socket.on('offline', () => this.emit('offline'))

      socket.on('data', (data) => {
        const fault = Fault.from(data)
        if (fault) {
          this.emit('error', fault, !!pathTo(data, 'disconnect'))
        }
        this.emit('data', data)
      })

      socket.on('error', (err) => {
        this.emit('error', Fault.from(err))
      })

      socket.on('reconnect', () => this.emit('reconnect'))
      socket.on('reconnected', () => this.emit('reconnected'))
      socket.on('reconnect scheduled', () => this.emit('reconnect scheduled'))
      socket.on('reconnect timeout', () => this.emit('reconnect timeout'))
      socket.on('reconnect failed', () => this.emit('reconnect failed'))

      privates.socket = socket
    }

    return socket
  }

  send(event, data, callback) {
    let ack
    if (callback) {
      ack = (err, result) => {
        callback(Fault.from(err), result)
      }
    }
    this.socket.send(event, data, ack)
  }

}


module.exports = {
  WsClient
}
