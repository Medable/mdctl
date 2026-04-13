/***********************************************************

 @script     Axon - Study Data Lock Library

 @brief      Manages functions and triggers for locking study data

 @author     Fiachra Matthews

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import _ from 'underscore'
import { trigger, log } from 'decorators'
import faults from 'c_fault_lib'
import moment from 'moment'
import logger from 'logger'
import { paths } from 'util'
import cache from 'cache'

const { c_locks, c_task_responses, c_public_users, c_queries } = org.objects

const { read } = consts.accessLevels

// Put the object data together into one place
function getObjectData(scr) {
  let obj = {}

  if (scr.arguments.old) {
    obj = Object.assign(obj, scr.arguments.old)
  }

  if (scr.arguments.new) {
    obj = Object.assign(obj, scr.arguments.new)
  }

  return obj
}

function checkObjectIdExists(object, _id) {
  return org.objects[object].find({ _id })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .hasNext()
}

// for every all object we need to collect the id of object that may have locks attached
function getConnectedObjectIds(obj) {

  const conObjIds = [obj._id]

  // c_study is covered by above
  if (obj.object === 'c_site') {
    conObjIds.push(obj.c_study._id)
  } else if (obj.object === 'c_public_user') {
    conObjIds.push(obj.c_study._id)
    if (obj.c_site) {
      conObjIds.push(obj.c_site._id)
    }
  } else if (obj.object === 'c_task_response') {
    conObjIds.push(obj.c_study._id)
    if (obj.c_site) {
      conObjIds.push(obj.c_site._id)
    }
    if (obj.c_public_user) {
      conObjIds.push(obj.c_public_user._id)
    }
  } else if (obj.object === 'c_step_response') {
    if (!obj.c_study) {
      const study = c_task_responses.find({ _id: obj.c_task_response._id })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .next().c_study
      conObjIds.push(study._id)
    } else {
      conObjIds.push(obj.c_study._id)
    }

    if (obj.c_site) {
      conObjIds.push(obj.c_site._id)
    }
    if (obj.c_public_user) {
      conObjIds.push(obj.c_public_user._id)
    }
  } else if (obj.object === 'c_query') {
    if (!obj.c_study) {
      const study = c_task_responses.find({ _id: obj.c_task_response._id })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .next().c_study
      conObjIds.push(study._id)
    } else {
      conObjIds.push(obj.c_study._id)
    }

    if (obj.c_site) {
      conObjIds.push(obj.c_site._id)
    }
    if (obj.c_subject) {
      conObjIds.push(obj.c_subject._id)
    }
  }

  return conObjIds
}

function checkSoftLockConditions(obj, action, scr) {
  // With soft locks:
  // - queries can be created
  // - public users can be approved
  // - task responses can be reviewed

  if (obj.object === 'c_task_response' && action === 'Create') {
    faults.throw('axon.accessDenied.softLockRestricted')
  }

  // service account updates should be allowed in response to legitimate changes
  if (scr.principal.service) {
    return true
  }

  if (obj.object === 'c_query' && (action === 'Update' || action === 'Create')) {
    return true
  } else if (obj.object === 'c_public_user') {
    if (action === 'Update') {
      if (scr.arguments.new.c_review_status && scr.arguments.new.c_review_status === 'Approved') {
        return true
      }
    }
  } else if (obj.object === 'c_review' && action === 'Create') {
    return true
  }

  faults.throw('axon.accessDenied.softLockRestricted')
}

function checkSnapshotLockConditions(obj, lock, action, scr) {

  // service account updates should be allowed in response to legitimate changes
  if (scr.principal.service) {
    return true
  }

  if (obj.object !== 'c_step_response') {
    return true
  }

  if (action === 'Create') {
    return true
  } else if (action === 'Update') {
    const snapshotTime = moment(lock.c_snapshot_date)
    if (snapshotTime.isBefore(moment(obj.created))) {
      return true
    }
  }

  faults.throw('axon.accessDenied.snapshotLockRestricted')

}

function getItem(object, _id, options = {}) {

  const { requiredPaths } = options

  const [item] = org.objects[object]
    .find({ _id })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .paths(...requiredPaths)
    .toArray()

  return item
}

// returns a string of a object in the format specified
function findItemString(item, options = {}) {

  const { requiredPaths, strTemplate } = options

  const foundValues = requiredPaths
    .map(path => paths.to(item, path))
    .filter(path => path)

  if (strTemplate) {
    return strTemplate(item)
  } else {
    return foundValues.join(',')
  }

}

class StudyLock {

  // Used to define locks that are blocked in case a hard lock is active.
  static childLockTypes = {
    soft: true,
    snapshot: true,
    unlock: true
  }

  static hasHardLock = c_locks.find({ c_active: true, c_type: 'hard' })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .hasNext()

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_task_response', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static taskResponseBeforeCreate() {
    StudyLock.checkLock(script, 'Create')
  }

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_step_response', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static stepResponseBeforeCreate() {
    StudyLock.checkLock(script, 'Create')
  }

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_study', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static studyBeforeCreate() {
    StudyLock.checkLock(script, 'Create')
  }

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_public_user', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static publicUserBeforeCreate() {
    StudyLock.checkLock(script, 'Create')
  }

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_site', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static siteBeforeCreate() {
    StudyLock.checkLock(script, 'Create')
  }

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_query', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static queryBeforeCreate() {
    StudyLock.checkLock(script, 'Create')
  }

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_review', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static reviewBeforeCreate() {
    StudyLock.checkLock(script, 'Create')
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_task_response', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static taskResponseBeforeUpdate() {
    StudyLock.checkLock(script, 'Update')
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_step_response', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static stepResponseBeforeUpdate() {
    StudyLock.checkLock(script, 'Update')
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_study', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static studyBeforeUpdate() {
    StudyLock.checkLock(script, 'Update')
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_public_user', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static publicUserBeforeUpdate() {
    StudyLock.checkLock(script, 'Update')
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_site', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static siteBeforeUpdate() {
    StudyLock.checkLock(script, 'Update')
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_query', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static queryBeforeUpdate() {
    StudyLock.checkLock(script, 'Update')
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_review', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static reviewBeforeUpdate() {
    StudyLock.checkLock(script, 'Update')
  }

  @log({ traceError: true })
  @trigger('delete.before', { object: 'c_task_response', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static taskResponseBeforeDelete() {
    StudyLock.checkLock(script, 'Delete')
  }

  @log({ traceError: true })
  @trigger('delete.before', { object: 'c_step_response', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static stepResponseBeforeDelete() {
    StudyLock.checkLock(script, 'Delete')
  }

  @log({ traceError: true })
  @trigger('delete.before', { object: 'c_study', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static studyBeforeDelete() {
    StudyLock.checkLock(script, 'Delete')
  }

  @log({ traceError: true })
  @trigger('delete.before', { object: 'c_public_user', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static publicUserBeforeDelete() {
    StudyLock.checkLock(script, 'Delete')
  }

  @log({ traceError: true })
  @trigger('delete.before', { object: 'c_site', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static siteBeforeDelete() {
    StudyLock.checkLock(script, 'Delete')
  }

  @log({ traceError: true })
  @trigger('delete.before', { object: 'c_query', if: { $cache: 'study_lock_enabled' }, weight: -9999 })
  static queryBeforeDelete() {
    StudyLock.checkLock(script, 'Delete')
  }

  static checkLock(scr, action) {

    const obj = action === 'Delete'
      ? org.objects[scr.context.object].readOne({ _id: scr.context._id })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .execute()
      : getObjectData(scr)
    const ids = getConnectedObjectIds(obj)

    const match = { c_active: true, c_locked_object_id: { $in: ids } }

    const locks = c_locks.find(match)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    if (locks.length === 0) return true

    const unlock = locks.find(v => v.c_type === 'unlock')
    const hard = locks.find(v => v.c_type === 'hard')
    const soft = locks.find(v => v.c_type === 'soft')
    const snapshot = locks.find(v => v.c_type === 'snapshot')

    const isUnlock = action === 'Update' && unlock && obj.object === 'c_step_response' && unlock.c_locked_object_id.equals(obj._id)

    if (isUnlock) return true

    if (hard) {
      faults.throw('axon.accessDenied.hardLockRestricted')
    }

    if (snapshot) {
      checkSnapshotLockConditions(obj, snapshot, action, scr)
    }

    if (soft) {
      checkSoftLockConditions(obj, action, scr)
    }

    return true
  }

  static performHardLockValidations(studyId) {

    // eslint-disable-next-line eqeqeq
    const allowedRoles = [`${consts.roles['Principal Data Manager']}`, `${consts.roles['Data Manager']}`]
    const isAllowed = script.principal.roles.find(v => allowedRoles.includes(v.toString()))

    if (!isAllowed) {
      faults.throw('axon.accessDenied.hardLockCreateFail')
    }

    const unresolvedQueries = c_queries
      .find({ c_study: studyId, c_status: { $in: ['open', 'responded'] } })
      .skipAcl()
      .grant(read)
      .count()

    if (unresolvedQueries) {
      faults.throw('axon.validationError.unresolvedQueries')
    }

    const incompleteTaskResponses = c_task_responses
      .find({
        c_clean_status: 'needs_review',
        c_study: studyId,
        c_status: { $in: ['New', 'Incomplete', 'Complete'] }
      })
      .skipAcl()
      .grant(read)
      .count()

    if (incompleteTaskResponses) {
      faults.throw('axon.validationError.incompleteReviews')
    }

    const incompleteSubjects = c_public_users
      .find({
        c_number: { $exists: true },
        c_review_status: {
          $in: [
            'Open',
            'Review'
          ]
        }
      })
      .skipAcl()
      .grant(read)
      .count()

    if (incompleteSubjects) {
      faults.throw('axon.validationError.unsignedCasebooks')
    }

  }

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_lock', weight: 1 })
  static lockCreate({ new: c_lock }) {

    cache.set('study_lock_enabled', true)

    StudyLock.validateLockOperation(c_lock.c_type)

    if (c_lock.c_type !== 'unlock' && StudyLock.hasHardLock) {
      faults.throw('axon.accessDenied.hardLockExists')
    }

    if (c_lock.c_type === 'hard' || c_lock.c_type === 'snapshot') {

      if (!c_lock.c_locked_object_type === 'study' || !checkObjectIdExists('c_studies', c_lock.c_locked_object_id)) {

        faults.throw('axon.accessDenied.hardSNLocksStudyOnly')
      }

      if (c_lock.c_type === 'hard') {

        this.performHardLockValidations(c_lock.c_locked_object_id)
      }

    } else if (c_lock.c_type === 'soft') {
      if (c_lock.c_locked_object_type === 'study') {
        if (!checkObjectIdExists('c_studies', c_lock.c_locked_object_id)) {
          faults.throw('axon.accessDenied.lockObjectIdMatch')
        }
      } else if (c_lock.c_locked_object_type === 'site') {
        if (!checkObjectIdExists('c_sites', c_lock.c_locked_object_id)) {
          faults.throw('axon.accessDenied.lockObjectIdMatch')
        }
      } else if (c_lock.c_locked_object_type === 'subject') {
        if (!checkObjectIdExists('c_public_user', c_lock.c_locked_object_id)) {
          faults.throw('axon.accessDenied.lockObjectIdMatch')
        }
      } else {
        faults.throw('axon.accessDenied.softLockObjectMismatch')
      }

    } else if (c_lock.c_type === 'unlock') {
      if (c_lock.c_locked_object_type === 'step_response') {
        if (!checkObjectIdExists('c_step_responses', c_lock.c_locked_object_id)) {
          faults.throw('axon.accessDenied.lockObjectIdMatch')
        }
      } else {
        faults.throw('axon.accessDenied.unlockLockObjectMismatch')
      }
    }

    const { c_type, c_locked_object_type, c_locked_object_id, c_snapshot_date } = c_lock

    const getItemByLockedObjectTypes = {
      study: {
        object: 'c_study',
        _id: c_locked_object_id,
        options: {
          requiredPaths: ['c_name']
        }
      },
      site: {
        object: 'c_site',
        _id: c_locked_object_id,
        options: {
          requiredPaths: ['c_name']
        }
      },
      subject: {
        object: 'c_public_user',
        _id: c_locked_object_id,
        options: {
          requiredPaths: ['c_number', 'c_site'],
          strTemplate: _.template('<%= c_number %>')
        }
      },
      step_response: {
        object: 'c_step_response',
        _id: c_locked_object_id,
        options: {
          requiredPaths: ['c_task.c_name', 'c_public_user.c_number', 'c_public_user.c_site'],
          // eslint-disable-next-line no-template-curly-in-string
          strTemplate: _.template('<%= c_task.c_name %> (<%= c_public_user.c_number %>)')
        }
      }
    }

    const isSnapshot = c_type === 'snapshot'

    let itemString

    const itemByLockedType = getItemByLockedObjectTypes[c_locked_object_type]
    const { _id, object, options } = itemByLockedType

    const item = getItem(object, _id, options)

    if (isSnapshot) {
      itemString = new Date(c_snapshot_date)
        .toISOString()
    } else {
      itemString = findItemString(item, options)
    }

    script.arguments.new.update('c_item', itemString, { grant: consts.accessLevels.update })

    if (['c_site', 'c_public_user', 'c_step_response'].includes(object)) {
      if (object === 'c_site') {
        script.arguments.new.update('c_site', item._id, { grant: consts.accessLevels.update })
      } else {
        const site = item.site || (item.c_public_user && item.c_public_user.c_site)
        if (site) {
          script.arguments.new.update('c_site', site._id, { grant: consts.accessLevels.update })
        }
      }

    }
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_lock', weight: 1 })
  static lockUpdate({ old: c_lock_old }) {
    StudyLock.validateLockOperation(c_lock_old.c_type)
    // eslint-disable-next-line eqeqeq
    const allowedRoles = [`${consts.roles['Principal Data Manager']}`, `${consts.roles['Data Manager']}`]
    const isAllowed = script.principal.roles.find(v => allowedRoles.includes(v.toString()))
    if (c_lock_old.c_type === 'hard' && !isAllowed) {
      faults.throw('axon.accessDenied.hardLockUpdateFail')
    }
  }

  static validateLockOperation(lockType) {
    // The lock module shall not allow a soft or snapshot lock to be deactivated if a Hard Lock is active
    if (StudyLock.childLockTypes[lockType]) {
      if (StudyLock.hasHardLock) {
        faults.throw('axon.accessDenied.hardLockExists')
      }
    }
  }

}

module.exports = StudyLock