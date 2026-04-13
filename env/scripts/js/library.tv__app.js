/**
 * Copyright 2020 Medable Inc.
 *
 * TeleVisit Web Package.
 *
 * @author James Sas <james@medable.com>
 */

/* global script */

const { route, trigger, job } = require('decorators'),
      { Account, Room, RoomEvent } = org.objects,
      { array: toArray, isSet } = require('util.values'),
      { equalIds, inIdArray } = require('util.id'),
      pathTo = require('util.paths.to'),
      config = require('config'),
      { createAuthToken } = Account,
      { handleParticipantEvent } = require('c_axon_room_event_library'),
      { getUserRolesSimple } = require('c_nucleus_utils')

const NewSiteRoles = [
  'Axon Site User',
  'Axon Site Monitor',
  'Axon Site Investigator'
]
  .map((roleString) => consts.roles[roleString])
  .filter((role) => role);

function grantAccessToInviteUsersRoute(c_site) {
    const allowedRoles = ['Administrator', 'Site User', 'Site Investigator', 'Axon Site User', 'Axon Site Investigator'],
          // get the users roles
          roles = getUserRolesSimple(script.principal._id, c_site)
            .map(v => v.toString()),
          // get the ids of the allowed roles
          aRoleIds = allowedRoles.map(v => consts.roles[v].toString()),
          // check if the user roles are in the granted roles
          granted = aRoleIds.some(r => roles.indexOf(r) >= 0)
          return granted
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

function getSite(siteId) {
  if (script.principal.roles.some(role => inIdArray(NewSiteRoles, role))) {
    const account = org.objects.accounts.find({ _id: script.principal._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('c_site_access_list')
      .passive()
      .next()

    if (inIdArray(account.c_site_access_list, siteId)) {
      return org.objects.c_site
        .readOne({_id: siteId})
        .skipAcl()
        .grant('read')
        .throwNotFound(false)
        .execute()
    }

  } else {
    return org.objects.c_site.readOne({ _id: siteId })
      .throwNotFound(false)
      .execute()
  }
}

// ---------------------------------------------------------------------------------------------------------------------

class TvWsToken {

  constructor(issuer, subject) {
    this._issuer = issuer
    this._subject = subject
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
    return this._scope.slice()
  }

}

// ---------------------------------------------------------------------------------------------------------------------

class TvConfig {

  static _local = null

  static _installed = null

  static get(key, defaultValue = null) {

    let val

    if (!isSet(this._local)) {
      this._local = config('tv_config') || {}
    }

    val = pathTo(this._local, key)

    if (!isSet(val)) {

      if (!isSet(this._installed)) {
        this._installed = config('tv__config') || {}
      }

      val = pathTo(this._installed, key)

    }

    return isSet(val) ? val : defaultValue
  }

  static set(key, val) {

    this._local = null
    return config(`tv_config.${key}`, val)
  }

}

// ---------------------------------------------------------------------------------------------------------------------

class TvWs {

  static get version() {

    return TvConfig.get('version')
  }

  /**
   * Retrieves the correct issuer app based on tv_config.wss.endpoint or tv__config.wss.endpoint. The default is the
   * configured defaults that are part of the package.
   *
   * @returns {null}
   */
  static get endpoint() {

    let endpoint = TvConfig.get('wss.endpoint')

    if (!endpoint) {

      const { env: { host } } = script,
            endpoints = toArray(TvConfig.get('wss.endpoints')),
            wildcard = endpoints.find((v) => v.server === '*').url,
            configured = endpoints.find((v) => toArray(v.server).includes(host))

      if (configured) {
        endpoint = configured.url
      } else {
        endpoint = wildcard
      }

    }

    return endpoint
  }

  /**
   * Retrieves the correct issuer app based on tv_config.issuer or tv__config.issuer. The default is the tv__ws_issuer
   * app that come with the package.
   *
   * @returns {string}
   */
  static get issuer() {

    const issuer = TvConfig.get('wss.issuer')
    return issuer || 'tv__ws_issuer'
  }

  /**
   * Retrieves televisit config for user configurable items like wait time, default appointment time, etc.
   *
   * @returns {number}
   */
  static get televisitConfig() {

    return TvConfig.get('televisit')
  }

  /**
   * Retrieves the correct issuer app based on tv_config.wss.tokenExpirySeconds or
   * tv__config.wss.tokenExpirySeconds. The default is 86400.
   *
   * @returns {number}
   */
  static get tokenExpirySeconds() {

    const tokenExpirySeconds = TvConfig.get('wss.tokenExpirySeconds')
    return tokenExpirySeconds || 86400
  }

  /**
   * Create generic pubsub token for call participant.
   *
   * @param accountId
   * @param roomId
   * @returns {*}
   */
  static createToken(accountId, roomId) {

    const { issuer } = this,
          exp = this.tokenExpirySeconds,
          jwt = new TvWsToken(issuer, accountId)

    jwt.pubsub('room', roomId) // note: not the tv actual Room instance id. Could be anything.

    return jwt.generate(exp)
  }

}

// ---------------------------------------------------------------------------------------------------------------------

class TvApp {

  @job('* * * * *', {
    name: 'tv__app_job_gc',
    active: true,
    if: {
      $and: [
        {
          $ifNull: [
            { $config: 'tv_config.rooms.useGC' },
            { $config: 'tv__config.rooms.useGC' }
          ]
        },
        {
          $dbNext: {
            object: 'room',
            where: { state: { $in: ['new', 'pending', 'open'] } },
            skipAcl: true,
            grant: 'public',
            paths: ['_id']
          }
        }
      ]
    }
  })
  static 'tv__app_job_gc'() {

    const cursor = Room.find({ state: { $in: ['new', 'pending', 'open'] }, st__gc: { $lte: new Date() } }).skipAcl().grant('script')

    while (cursor.hasNext()) {
      handleParticipantEvent(cursor.next(), { name: 'disconnected ' })
    }

  }

  @route('GET tv__app/connect/:eventId', { name: 'tv__app_route_get_connect' })
  static 'tv__app_route_get_connect'({ req: { params: { eventId } } }) {

    if (eventId === 'undefined') {
      eventId = '000000000000000000000000'
    }

    const { account, c_event: Event, c_site: Site } = org.objects,
          { principal: { _id: callerId } } = script,
          doc = script.as(
            callerId,
            { principal: { grant: 'read', skipAcl: true }, safe: false },
            () => Event.readOne({ _id: eventId })
              .paths('creator')
              .include('c_public_user.c_account', 'c_public_user.c_site')
              .throwNotFound(false)
              .execute()
          ),
          publicUserAccountId = pathTo(doc, 'c_public_user.c_account._id'),
          publicUserSite = pathTo(doc, 'c_public_user.c_site._id'),
          site = Site.readOne({_id: publicUserSite})
              .grant(1)
              .paths('access')
              .throwNotFound(false)
              .execute(),
          callerAccount = account.readOne({_id: callerId})
              .paths('c_site_access_list')
              .passive()
              .execute(),
          assignedSites = pathTo(callerAccount, 'c_site_access_list')

    // if account is the public user account for the event, ok.
    //
    // if not, check that the account is assigned to the site the public user belongs to
    if (doc && !equalIds(callerId, publicUserAccountId) && !inIdArray(assignedSites, publicUserSite) && !site && !(site.access > 1)) {
      // @todo select appropriate access denied fault for axon.
      throw Fault.create('cortex.accessDenied.unspecified', { reason: 'nacho cheese' })
    }

    return {
      eventId,
      televisit: TvWs.televisitConfig,
      wss: {
        endpoint: TvWs.endpoint,
        jwt: TvWs.createToken(callerId, eventId)
      }
    }

  }

  @route('GET tv__app/event/:context/:contextId', { name: 'tv__app_route_get_event' })
  static 'tv__app_route_get_event'({ req: { params: { context, contextId } } }) {

    if (!contextId) return

    if (context === 'doc') {

      // retrieve event from document id if it exists
      // for econsent app
      const { account, c_event: Event } = org.objects,
            { principal: { _id: callerId } } = script,
            doc = script.as(
              callerId,
              { principal: { grant: 'read', skipAcl: true }, safe: false },
              () => Event.readOne({ ec__signed_document: contextId, c_canceled: false, type: 'c_televisit_event', c_end: { $gte: (new Date()).toISOString()} })
                .paths('c_start', 'c_title', 'c_public_user.c_site')
                .throwNotFound(false)
                .execute()
            ),
            publicUserSite = pathTo(doc, 'c_public_user.c_site._id'),
            site = getSite(publicUserSite)

      if (doc && !site ) {
        throw Fault.create('cortex.accessDenied.unspecified', { reason: 'nacho cheese' })
      }

      return doc
    }

    if (context === 'patient') {

      // retrieve event from public user id
      // for pat app web
      const { account, c_event: Event, c_public_user: PublicUser, c_caregiver_relationship: Relationship } = org.objects,
            { principal: { _id: callerId } } = script

      // First try to get public user from account
      const publicUser = script.as(
        callerId,
        { principal: { grant: 'read', skipAcl: true }, safe: false },
        () => PublicUser.readOne({ c_account: contextId })
          .paths()
          .throwNotFound(false)
          .execute()
      )

      if (!publicUser) {
        return null
      }

      // Try to get events for this public user
      let doc = script.as(
        callerId,
        { principal: { grant: 'read', skipAcl: true }, safe: false },
        () => Event.readOne({ c_public_user: publicUser._id, c_canceled: false, type: 'c_televisit_event', c_end: { $gte: (new Date()).toISOString()} })
          .paths('c_start', 'c_title', 'c_public_user')
          .sort({c_start: 1})
          .throwNotFound(false)
          .execute()
      )

      // If no events found, try to get events through caregiver relationship
      if (!doc) {
        const caregiverRelCursor = Relationship.find({
          $or: [
            {c_client: publicUser._id},
            {c_caregivers_info: {$elemMatch: {c_public_user: publicUser._id}}}
          ]
        })
        .expand(['c_client'])
        .skipAcl()
        .grant(consts.accessLevels.read)

        if (caregiverRelCursor.hasNext()) {
          const caregiverRel = caregiverRelCursor.next()
          const clientId = pathTo(caregiverRel, 'c_client._id')

          if (clientId) {
            doc = script.as(
              callerId,
              { principal: { grant: 'read', skipAcl: true }, safe: false },
              () => Event.readOne({ c_public_user: clientId, c_canceled: false, type: 'c_televisit_event', c_end: { $gte: (new Date()).toISOString()} })
                .paths('c_start', 'c_title', 'c_public_user')
                .sort({c_start: 1})
                .throwNotFound(false)
                .execute()
            )
          }
        }
      }

      return doc
    }

    if (context === 'participant') {

      // retrieve event from participant id if it exists
      // for ad-hoc televisits
      const eConsentVersion = config('ec__version'),
            eventMatch = { c_public_user: contextId, c_group: null, c_canceled: false, type: 'c_televisit_event', c_end: { $gte: (new Date()).toISOString()} }

      if (eConsentVersion) {
        eventMatch['ec__signed_document'] = null
      }

      const { c_event: Event, c_site: Site } = org.objects,
            { principal: { _id: callerId } } = script,
            doc = script.as(
              callerId,
              { principal: { grant: 'read', skipAcl: true }, safe: false },
              () => Event.readOne(eventMatch)
                .paths('c_start', 'c_title', 'c_public_user.c_site')
                .throwNotFound(false)
                .passive(true)
                .execute()
            ),
            publicUserSite = pathTo(doc, 'c_public_user.c_site._id'),
            site = getSite(publicUserSite)

      if (doc && !site) {
        throw Fault.create('cortex.accessDenied.unspecified', { reason: 'nacho cheese' })
      }

      return doc
    }

    if (context === 'group') {

      // retrieve event from group id if it exists
      // for site app
      const { c_event: Event, c_site: Site } = org.objects,
          { principal: { _id: callerId } } = script,
          doc = script.as(
              callerId,
              { principal: { grant: 'read', skipAcl: true }, safe: false },
              () => Event.readOne({ c_group: contextId, c_canceled: false, type: 'c_televisit_event', c_end: { $gte: (new Date()).toISOString()} })
                .paths('c_start', 'c_title', 'c_public_user.c_site')
                .throwNotFound(false)
                .execute()
            ),
            publicUserSite = pathTo(doc, 'c_public_user.c_site._id'),
            site = getSite(publicUserSite)

      if (doc && !site) {
        throw Fault.create('cortex.accessDenied.unspecified', { reason: 'nacho cheese' })
      }

      return doc
    }
  }

  static getCallDocByPublicUser(publicUserId, callerId, extraPaths = [], includePaths = []) {
    const { c_call: Call } = org.objects

    return script.as(
        callerId,
        { principal: { grant: 'read', skipAcl: true }, safe: false },
        () => {
          let callQuery = Call.readOne({ c_public_user: publicUserId, c_status: { $in: ['starting', 'open'] } })
              .throwNotFound(false)
              .sort({ _id: -1 })

          if (extraPaths.length) callQuery = callQuery.paths(...extraPaths)
          if (includePaths.length) callQuery = callQuery.include(...includePaths)

          return callQuery.execute()
        }
    )
  }

  static getTokenForUser(publicUserId, callerId) {
    const callDoc = this.getCallDocByPublicUser(publicUserId, callerId, ['c_room.token'])
    return pathTo(callDoc, 'c_room.token')
  }


  @route('GET tv__app/token/:publicUserId', { name: 'tv__app_route_get_token' })
  static 'tv__app_route_get_token'({ req: { params: { publicUserId } } }) {

    const { c_caregiver_relationship: Relationship } = org.objects,
        { principal: { _id: callerId } } = script

    const doc = this.getCallDocByPublicUser(
        publicUserId,
        callerId,
        ['creator', 'c_room.token'],
        ['c_public_user.c_account']
    )

    const token = pathTo(doc, 'c_room.token')

    if (token) {
      return token
    }  else {

      // Step 2: Try to get the token as a caregiver
      const caregiverRelCursor = Relationship.find({
        $or: [
          {c_client: publicUserId},
          {c_caregivers_info: {$elemMatch: {c_public_user: publicUserId}}}
        ]
      })
          .expand(['c_client'])
          .skipAcl()
          .grant(consts.accessLevels.read)

      if (caregiverRelCursor.hasNext()) {
        const caregiverRel = caregiverRelCursor.next()
        const clientId = pathTo(caregiverRel, 'c_client._id')

        if (clientId) {
          return this.getTokenForUser(clientId, callerId)
        }
      }
    }
    return null
  }


  @route('PUT tv__app/event/update/:eventId', { name: 'tv__app_route_update_event' })
  static 'tv__app_route_update_event'({ req, body }) {
    const { eventId } = req.params
    const { c_event: Event, c_site: Site } = org.objects,
        { principal: { _id: callerId } } = script,
        doc = script.as(
            callerId,
            { principal: { grant: 'read', skipAcl: true }, safe: false },
            () => Event.readOne({ _id: eventId, c_canceled: false, type: 'c_televisit_event', c_end: { $gte: (new Date()).toISOString()} })
            .paths('c_public_user.c_site')
            .throwNotFound(false)
            .execute()
        ),
        publicUserSite = pathTo(doc, 'c_public_user.c_site._id'),
        grantAccess = grantAccessToInviteUsersRoute(publicUserSite)

    if (doc && !grantAccess) {
        throw Fault.create('axon.accessDenied.routeAccessDenied', { reason: 'Route access denied.' })
    }else {
        return script.as(script.principal._id, { principal: { skipAcl: true, grant: 'update' } }, () => {
            const eventUpdate = Event.updateOne({ _id: eventId }, { $set: body() }).execute()
            return Event.readOne({ _id: eventId }).execute()
        })
    }
  }

  /**
   * Override Axon default behaviour
   */
  @trigger('participant.after', {
    name: 'c_axon_room_onParticipantEvent', object: 'room', weight: 1, inline: false
  })
  static 'c_axon_room_onParticipantEvent'() {

    const { arguments: { event, old: room }, principal } = script

    console.log('participant.after', { principal, event })

    // Axon wants to end the call as soon as there is a disconnect event. For web, this creates an issue because browser
    // refreshing causes the call to end. Instead, we implement garbage collection on a cron after 60 seconds.

    // perhaps re-query for the room
    // adding a check on participant length so we seend the right missed call notification
    if (event.name === 'disconnected' && room.participants.length > 1) {

      const { useGC, gcExpiry } = TvConfig.get('rooms')

      if (useGC) {

        const { roomId } = room,
              someConnected = (
                RoomEvent.aggregate()
                  .match({ roomId, type: 'participant', name: { $in: ['connected', 'disconnected'] } })
                  .group({
                    _id: 'accountId',
                    connects: { $sum: { $cond: [{ $eq: ['name', { $string: 'connected' }] }, 1, 0] } },
                    disconnects: { $sum: { $cond: [{ $eq: ['name', { $string: 'disconnected' }] }, 1, 0] } }
                  })
                  .project({
                    _id: 1,
                    connected: { $cond: [{ $gt: ['connects', 'disconnects'] }, true, false] }
                  })
                  .grant('delete')
                  .skipAcl()
                  .toArray() || []
              ).some(({ connected } = {}) => connected),
              expireAt = new Date(Date.now() + gcExpiry)

        Room.updateOne({ _id: roomId }, { $set: { st__gc: someConnected ? null : expireAt } }).skipAcl().grant('script').execute()

      }

      return
    }

    handleParticipantEvent(room, event)
  }

}


module.exports = {
  TvConfig,
  TvWsToken,
  TvApp,
  TvWs
}