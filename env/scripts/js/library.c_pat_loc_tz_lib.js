/***********************************************************

 @script     Axon - Subject Timezone and Locale Update

 @brief      Creates a runtime route that updates subject
             timezone and locales

 @author     Fiachra Matthews

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { route, trigger } from 'decorators'
import { principals, accessLevels } from 'consts'
import { isIdFormat } from 'util.id'
import faults from 'c_fault_lib'
import logger from 'logger'
import request from 'request'
import cache from 'cache'
import { OldSiteAccessManagerLibrary } from 'c_axon_sites_access_manager_lib'

const { c_public_users, accounts } = org.objects

const ALLOWED_NEW_SITE_ROLES = ['Axon Site Investigator',
  'Axon Site User',
  'Axon Site Monitor',
  'Axon Site Auditor',
  'EC Document Manager',
  'Study Manager App',
  'DCR view and comment'
].map(role => consts.roles[role] && consts.roles[role].toString())
  .filter(Boolean)

function updateSubject(c_public_user, update) {
  c_public_users
    .updateOne({ _id: c_public_user }, { $set: update })
    .skipAcl()
    .grant(accessLevels.update)
    .execute()
}

class PatTzLoc {

  /***********************************************************

  @brief      Anonymously callable route to update a subjects timezone a locale
              * Only public users without registered accounts can be updated anonymously
              * Registered users can only update their own

  @route      routes/c_public_users/:c_public_user/

  @body
      {
        "c_tz": "Europe/Dublin",
        "c_locale": "en_IE"
      }

  @response    the public user object with only the updated props:

      {
        "object": "c_public_user",
        "_id": ID,
        "c_tz": "Europe/Dublin",
        "c_locale": "en_IE"
      }

  (c)2019 Medable, Inc.  All Rights Reserved.

  ***********************************************************/
  /**
   * @openapi
   * /c_public_users/{c_public_user}:
   *  put:
   *    description:  "Anonymously callable route to update a subjects timezone a locale.
   *                  Only public users without registered accounts can be updated anonymously.
   *                  Registered users can only update their own."
   *    parameters:
   *      - name: c_public_user
   *        in: path
   *        required: true
   *        description: User ID
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              c_tz:
   *                type: string
   *              c_locale:
   *                type: string
   *
   *    responses:
   *      '200':
   *        content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                object:
   *                  type: string
   *                _id:
   *                  type: string
   *                c_tz:
   *                  type: string
   *                c_locale:
   *                  type: string
   */
  @route({
    weight: 1,
    method: 'PUT',
    name: 'c_axon_set_tz_locale',
    path: 'c_public_users/:c_public_user/',
    acl: ['account.anonymous']
  })
  updateLocTz({ req, body }) {
    const { c_public_user } = req.params
    const c_tz = body('c_tz')
    const c_locale = body('c_locale')

    if (!c_public_user || !isIdFormat(c_public_user)) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }

    const pu = c_public_users
      .readOne({ _id: c_public_user })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('c_account')
      .passive()
      .execute()

    if (!c_locale && !c_tz) {
      faults.throw('axon.invalidArgument.localeOrTzParameterRequired')
    }

    let update = {
      c_locale,
      c_tz
    }

    // eslint-disable-next-line
    update = Object.entries(update).reduce(
      (a, [k, v]) => (v ? { ...a, [k]: v } : a),
      {}
    )

    if (script.principal._id.equals(principals.anonymous)) {
      if (!pu.c_account) {
        updateSubject(pu._id, update)
      } else {
        faults.throw('axon.accessDenied.noAnonTzLocUpdate')
      }
    } else if (pu.c_account && script.principal._id.equals(pu.c_account._id)) {
      updateSubject(pu._id, update)
    } else {
      faults.throw('axon.accessDenied.selfUpdateOnly')
    }

    return c_public_users
      .readOne({ _id: c_public_user })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('c_tz', 'c_locale')
      .passive()
      .execute()
  }

  @trigger('create.before', {
    object: 'account',
    weight: 1,
    paths: ['roles'],
    if: {
      $cond: {
        if: {
          $eq: ['$$SCRIPT.env.name', 'development']
        },
        // if it is development
        then: {
          $eq: [
            {
              // only when the cache key is set
              $cache: 'direct_role_assignment_check_disabled'
            },
            false
          ]
        },
        // if it is production always run
        else: true
      }
    }
  })
  static accountBeforeCreate({ new: newAccount, old, context }) {
    OldSiteAccessManagerLibrary.checkForInvalidAccountRoles(newAccount)
  }

  // triggers to guarantee consistency of properties between account and public user
  @trigger('update.before', {
    object: 'account',
    weight: 1,
    if: {
      $or: [
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'locale'
            ]
          }, 0]
        },
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'tz'
            ]
          }, 0]
        },
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'roles'
            ]
          }, 0]
        }
      ]
    }
  })
  static accountBeforeUpdate({ new: newAccount, old: oldAccount, context, modified }) {

    if (modified.includes('roles')) {

      OldSiteAccessManagerLibrary.checkForInvalidAccountRoles(newAccount)
      OldSiteAccessManagerLibrary.checkIfHasSiteUserRole(newAccount)

      const isNewRoleValid = this.isNewSiteRoleConfigValid(newAccount)

      if (!isNewRoleValid) {
        faults.throw('axon.invalidArgument.noDirectAssignmentOfAccountRoleWithNewSiteRole')
      }
    }

    if (!newAccount.tz && !newAccount.locale) {
      return
    }

    // becasue both triggers are "update.before", it is not possible to check their current values
    // to determine if an update is necessary. Using a cache key linked to the request ID to keep
    // it out of a trigger fight.
    const cacheKey = `locTZUpdate-${request._id}`
    if (cache.has(cacheKey)) {
      return
    } else {
      cache.set(cacheKey, {}, 10)
    }

    const accCursor = accounts
      .find({ _id: context._id })
      .expand('c_public_users')
      .paths('c_public_users', 'tz', 'locale')
      .skipAcl()
      .grant(consts.accessLevels.read)

    if (accCursor.hasNext()) {
      const acc = accCursor.next()

      if (
        acc.c_public_users &&
        acc.c_public_users.data.length > 0 &&
        (newAccount.tz || newAccount.locale)
      ) {
        const pu = acc.c_public_users.data[0]
        if (
          newAccount.tz !== pu.c_tz ||
          newAccount.locale !== pu.c_locale
        ) {
          const update = {}

          if (newAccount.tz) {
            update.c_tz = newAccount.tz
          }

          if (newAccount.locale) {
            update.c_locale = newAccount.locale
          }

          c_public_users
            .updateOne({ _id: pu._id }, { $set: update })
            .skipAcl()
            .grant(consts.accessLevels.update)
            .execute()
        }
      }
    }
  }

  @trigger('update.before', {
    object: 'c_public_user',
    weight: 1,
    if: {
      $and: [
        {
          $eq: [{ $cache: { $concat: ['locTZUpdate-', '$$REQUEST._id'] } }, null]
        },
        {
          $or: [
            {
              $gte: [{
                $indexOfArray: [
                  '$$SCRIPT.arguments.modified',
                  'c_tz'
                ]
              }, 0]
            },
            {
              $gte: [{
                $indexOfArray: [
                  '$$SCRIPT.arguments.modified',
                  'c_locale'
                ]
              }, 0]
            }
          ]
        }
      ]
    }
  })
  static publicUserBeforeUpdate() {

    if (
      (script.arguments.new.c_tz &&
        script.arguments.new.c_tz === script.arguments.old.c_tz) ||
      (script.arguments.new.c_locale &&
        script.arguments.new.c_locale === script.arguments.old.c_locale)
    ) {
      return
    }

    // becasue both triggers are "update.before", it is not possible to check their current values
    // to determine if an update is necessary. Using a cache key linked to the request ID to keep
    // it out of a trigger fight.

    const cacheKey = `locTZUpdate-${request._id}`

    cache.set(cacheKey, {}, 10)

    const principal = script.principal._id.equals(principals.anonymous)
      ? 'c_system_user'
      : script.principal._id

    const pu = script.as(
      principal,
      {
        principal: { skipAcl: true, grant: consts.accessLevels.read },
        acl: { safe: false },
        modules: { safe: false }
      },
      () => {
        const puCursor = c_public_users
          .find({ _id: script.context._id })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .expand('c_account')
          .paths('c_account.locale')
          .paths('c_account.tz')
          .passive()

        return puCursor.hasNext() && puCursor.next()
      }
    )

    if (pu) {
      if (
        pu.c_account &&
        (script.arguments.new.c_tz || script.arguments.new.c_locale)
      ) {
        const acc = pu.c_account
        if (
          script.arguments.new.c_tz !== acc.tz ||
          script.arguments.new.c_locale !== acc.locale
        ) {
          const update = {}

          if (script.arguments.new.c_tz) {
            update.tz = script.arguments.new.c_tz
          }

          if (script.arguments.new.c_locale) {
            update.locale = script.arguments.new.c_locale
          }

          accounts
            .updateOne({ _id: acc._id }, { $set: update })
            .skipAcl()
            .grant(consts.accessLevels.update)
            .execute()
        }
      }
    }
  }

  static isNewSiteRoleConfigValid(account) {
    let valid = true
    const accountObject = org.objects.accounts.readOne({ _id: account._id })
      .paths('c_site_access_list')
      .throwNotFound(false)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .execute()

    if (accountObject && accountObject.c_site_access_list.length && account && account.roles) {
      const invalidSiteRoles = account.roles.filter(role => !ALLOWED_NEW_SITE_ROLES.includes(role.toString()))
      if (invalidSiteRoles.length) {
        valid = false
      }
    }
    return valid
  }

}

module.exports = PatTzLoc