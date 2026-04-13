/**
 * Copyright 2025 Medable Inc.
 *
 * @author James Sas <james@medable.com>
 */

/* global script, Fault */

const http = require('http'),
      { Account } = org.objects,
      { tryCatch } = require('util.values'),
      config = require('config'),
      { createAuthToken } = Account

let Undefined

function getWsEndpoint() {

  const { env: { host } } = script
  const { endpoints } = config.get('axon__websockets_config')

  if (host.includes('somaspace') || host.includes('alpha')) {
    const [firstPart, ...restParts] = host.split('.')
    const [, envId] = firstPart.split('-')
    return `ws-${envId}.${restParts.join('.')}`
  }

  const found = endpoints.find(item => host === item.server || item.server.includes(host))

  if (found) {
    return found.url
  }

  return endpoints.find(item => item.server === '*').url
}

class WsToken {

  constructor(issuer, subject) {
    this._issuer = issuer
    this._subject = subject
  }

  generate(expiresIn = null, validAt = null) {
    return createAuthToken(
      this._issuer,
      this._subject,
      {
        expiresIn,
        validAt,
        scope: this.scope
      }
    )
  }

  get scope() {
    return []
  }

}

function makeWsScope(kind = '*', objectName, identifier) {
  const parts = ['ws', kind]
  if (objectName) {
    parts.push(objectName)
    if (identifier) {
      parts.push(identifier)
    }
  }
  return parts.join('.')
}

class WsClientToken extends WsToken {

  constructor(issuer, subject) {
    super(issuer, subject)
    this._scope = []
  }

  sub(objectName, identifier) {
    this._scope.push(makeWsScope('subscribe', objectName, identifier))
    return this
  }

  pub(objectName, identifier) {
    this._scope.push(makeWsScope('publish', objectName, identifier))
    return this
  }

  pubsub(objectName, identifier) {
    this._scope.push(makeWsScope('*', objectName, identifier))
    return this
  }

  get scope() {
    return this._scope.slice()
  }

}

class WsApiToken extends WsToken {

  constructor() {
    super('st__app', 'st__service')
  }

  get scope() {
    return ['ws']
  }

}

// ------------------------------------

class Ws {

  constructor(endpoint = 'https://api-ws-edge.medable.com') {
    this._endpoint = endpoint
  }

  url(path) {
    return `${this._endpoint}${path}`
  }

  body(body) {
    return {
      body: JSON.stringify(body)
    }
  }

  options(options = {}) {

    return {
      strictSSL: script.env.domain !== 'local',
      headers: this.headers(),
      ...options
    }
  }

  headers() {

    const token = new WsApiToken().generate(60)
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }

}

class Topics extends Ws {

  broadcast(message, topic = '', { from = 'service' } = {}) {

    const {
            body, statusCode, statusMessage
          } = http.post(
            this.url(`/topic/publish/${topic}`),
            this.options(this.body({
              message, from
            }))
          ),
          [err, result] = tryCatch(() => JSON.parse(body)),
          fault = err ? Fault.create({ httpStatus: statusCode, reason: statusMessage }) : Fault.from(result)

    if (fault) {
      throw fault
    }

    return result

  }

}

class Rooms extends Ws {

  broadcast(room, message, { to = Undefined, except = Undefined, from = 'service' } = {}) {

    const {
            body, statusCode, statusMessage
          } = http.post(
            this.url(`/room/broadcast/${room}`),
            this.options(this.body({
              message, from, to, except
            }))
          ),
          [err, result] = tryCatch(() => JSON.parse(body)),
          fault = err ? Fault.create({ httpStatus: statusCode, reason: statusMessage }) : Fault.from(result)

    if (fault) {
      throw fault
    }

    return result
  }

}

class ParticipantWs {

  constructor(endpoint = getWsEndpoint()) {
    this._topics = new Topics(endpoint)
    this._rooms = new Rooms(endpoint)
  }

  get topics() {
    return this._topics
  }

  get rooms() {
    return this._rooms
  }

}

module.exports = {
  WsClientToken,
  WsApiToken,
  getWsEndpoint,
  ParticipantWs
}