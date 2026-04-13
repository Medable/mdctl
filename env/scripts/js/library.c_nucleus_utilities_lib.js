/***********************************************************

@script     Nucleus - Script Library

@brief      Utility functions used in Nucleus scripts

@author     Fiachra Matthews

@version    1.0.0

(c)2016-2018 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import _ from 'underscore'
import counters from 'counters'
import nucPermissions from 'c_nucleus_permissions'
import { debug } from 'logger'
import config from 'config'
import moment from 'moment'
import cache from 'cache'
import { TaskResponse } from 'c_dmweb_lib'
import faults from 'c_fault_lib'

const { c_public_users, c_group_tasks } = org.objects

// padding polyfill
if (!String.prototype.padStart) {
  // eslint-disable-next-line no-extend-native
  String.prototype.padStart = function padStart(targetLength, padString) {
    targetLength = targetLength >> 0 // truncate if number or convert non-number to 0;
    padString = String((typeof padString !== 'undefined' ? padString : ' '))
    if (this.length > targetLength) {
      return String(this)
    } else {
      targetLength = targetLength - this.length
      if (targetLength > padString.length) {
        padString += padString.repeat(targetLength / padString.length) // append to original to ensure we are longer than needed
      }
      return padString.slice(0, targetLength) + String(this)
    }
  }
}

function mergeObjects(source, target) {
  Object.keys(target)
    .forEach(function(k) {
      if (typeof target[k] === 'object') {
        source[k] = source[k] || {}
        mergeObjects(source[k], target[k])
      } else {
        source[k] = target[k]
      }
    })
}

module.exports = {
  AclManagment: nucPermissions.AclManagment,
  SystemUser: nucPermissions.SystemUser,
  getUserRoles: nucPermissions.getUserRoles,
  getUserRolesSimple: nucPermissions.getUserRolesSimple,
  isSystemUserID: nucPermissions.isSystemUserID,
  runnerIsAdmin: nucPermissions.runnerIsAdmin,
  isNewSiteUser: nucPermissions.isNewSiteUser,
  isSiteUser: nucPermissions.isSiteUser,

  counters: {
    COUNT_SUBJECT: 0,
    COUNT_TASK_RESPONSE: 1,
    COUNT_SITE: 2,
    COUNT_PUB_ID: 3,
    COUNT_QUERIES: 4
  },
  counterStrings: [
    'nuc-subject-',
    'nuc-task-resp-',
    'nuc-site-',
    'nuc-pub-id',
    'nuc-queries-'
  ],

  defaultSubIDLength: 5,
  defaultTaskRespIDLength: 9,
  defaultSiteIDLength: 5,
  defaultQueriesLength: 6,

  generateRandomCharactersString: function(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let result = ''
    for (let i = length; i > 0; --i) {
      result += chars[Math.floor(Math.random() * chars.length)]
    }
    return result
  },

  fillPlaceholder: function(formatSpec, num) {
    const placeHolderLen = (formatSpec.match(/#/g) || []).length

    const placeHolderAlphaNumLen = (formatSpec.match(/@/g) || []).length

    const numString = num.toString()

    const placeHolder = ''.padStart(placeHolderLen, '#')

    const placeHolderAlphaNum = ''.padStart(placeHolderAlphaNumLen, '@')

    if (placeHolderAlphaNumLen > 0) {
      formatSpec = formatSpec.replace(placeHolderAlphaNum, this.generateRandomCharactersString(placeHolderAlphaNumLen))
    }

    if (placeHolderLen > 0) {
      formatSpec = formatSpec.replace(placeHolder, numString.padStart(placeHolderLen, '0'))
    }

    return formatSpec
  },

  // returns the iso string of a time before which
  // all invites are expired
  getInviteExpiredBeforeTime() {
    let inviteExpiryTime = config.get('axon__invite_expiry_time_days')
    if (!inviteExpiryTime) {
      inviteExpiryTime = 7
      config.set('axon__invite_expiry_time_days', inviteExpiryTime)
    }

    // 0 or less means no expiry
    if (inviteExpiryTime <= 0) {
      return moment.utc('0001-01-01')
        .toISOString()
    } else {
      // convert days to minutes to allow a little more flexbility
      return moment()
        .subtract(inviteExpiryTime * 24 * 60, 'minutes')
        .toISOString()
    }

  },

  getNextID: function(counterID, defaultLength, formatSpec) {
    const counterVal = counters.next(counterID)

    if (!formatSpec) {
      formatSpec = ''.padStart(defaultLength, '#')
    }

    return this.fillPlaceholder(formatSpec, counterVal)
  },

  getNextQueryID: function(study) {
    const counterID = this.counterStrings[this.counters.COUNT_QUERIES] + study._id
    const formatSpec = study.c_format_spec_queries

    return this.getNextID(counterID, this.defaultQueriesLength, formatSpec)
  },

  getNextSubjectID: function(study, site) {
    const formatSpec = study.c_format_spec_subject_id || String()
    if (formatSpec.includes('{COUNTRY}') && !site.c_country) {
      faults.throw('axon.validation.siteCountryRequired')
    }

    if (formatSpec.includes('{PROTOCOL}') && !study.c_protocol_number) {
      faults.throw('axon.validation.protocolRequired')
    }

    let nextId
    if (formatSpec.includes('{SITE}') && site) {
      const siteNumberCounterId = `subject-on-${site.c_number}-`

      nextId = this.getNextID(siteNumberCounterId, this.defaultSubIDLength, formatSpec)
    } else {
      const counterID = this.counterStrings[this.counters.COUNT_SUBJECT] + study._id

      nextId = this.getNextID(counterID, this.defaultSubIDLength, formatSpec)
    }

    return this.buildNextSubjectID(nextId, study, site)
  },

  buildNextSubjectID: function(nextId, study, site) {
    if (site) {
      nextId = nextId
        .replace(/\{SITE\}/, site.c_number)
        .replace(/\{COUNTRY\}/, site.c_country)
    }

    if (study) {
      nextId = nextId.replace(/\{PROTOCOL\}/, study.c_protocol_number)
    }

    return nextId
  },

  // Uses the study Task format specifier. Each ID is unique to the study
  getNextTaskRespID: function(study) {
    const counterID = this.counterStrings[this.counters.COUNT_TASK_RESPONSE] + study._id
    const formatSpec = study.c_format_spec_tasks

    return this.getNextID(counterID, this.defaultTaskRespIDLength, formatSpec)
  },

  getNextSiteID: function(study) {
    const counterID = this.counterStrings[this.counters.COUNT_SITE] + study._id
    const formatSpec = study.c_format_spec_sites

    return this.getNextID(counterID, this.defaultSiteIDLength, formatSpec)
  },

  getNameIDStringFromPattern(account, pattern, modified) {
    // if the name is part of the account update, we need to make sure it's part of the
    // ID update too
    if (modified) {
      mergeObjects(account.name, modified)
    }

    const elements = pattern.split(' ')
    let idString = ''

    _.each(elements, element => {
      if (account.name[element]) {
        idString += account.name[element] + ' '
      }
    })

    return idString.trim()
  },

  // Checks to see does a particular value match one created with a format specifier
  matchesSpecifier(formatSpec, publicID) {
    // Take the format specifier, replace '#' with '\d' and append a '$'
    // treat that string as a regular expression
    // test does it match the pther parameter

    const regex = new RegExp(formatSpec.split('#')
      .join('\\d') + '$')
    return regex.test(publicID)
  },

  getNumberFromFormatSpec(identifier, formatSpec) {
    let returnNumber = ''

    if (isNaN(Number(identifier))) {
      formatSpec = formatSpec.replace(/(#+)/, '($1)')
      const regex = new RegExp(formatSpec.split('#')
        .join('\\d') + '$')
      const match = regex.exec(identifier)

      if (match && match.length > 1) {
        if (!isNaN(Number(match[1]))) {
          returnNumber = Number(match[1])
        }
      }
    } else {
      returnNumber = Number(identifier)
    }

    return String(returnNumber)
  },

  getNameIDStringFromFormatSpec(formatSpec) {
    return this.getNextID(this.counters.COUNT_PUB_ID, 5, formatSpec)
  },

  setPublicuserNameEmail(_id) {
    const update = {},
          public_user = script.as(script.principal._id, { principal: { grant: consts.accessLevels.read, skipAcl: true } }, () => {
            let pu
            try {
              pu = org.objects.c_public_users.find({ _id })
                .paths('c_participant_name_or_email', 'c_email', 'c_account.name', 'c_account.email')
                .passive()
                .next()
            } catch (err) {

            }

            if (pu.c_participant_name_or_email) pu.c_participant_name_or_email = pu.c_participant_name_or_email.toLowerCase()

            return pu
          }),
          acc = public_user.c_account

    if (acc && acc.name && (acc.name.first || acc.name.last)) {
      const c_participant_name = (((acc.name.first && `${acc.name.first}`) || '') + ((acc.name.last && ` ${acc.name.last}`) || '')).trim()
              .toLowerCase(),
            c_participant_name_or_email = public_user.c_participant_name_or_email
      if (!c_participant_name_or_email || c_participant_name_or_email !== c_participant_name) {
        update.c_participant_name_or_email = c_participant_name
        if (!public_user.c_email) update.c_email = acc.email
      }
    } else {
      const c_participant_email = (public_user.c_email) ? public_user.c_email.toLowerCase() : null
      if (c_participant_email) update.c_participant_name_or_email = c_participant_email
    }

    if (Object.keys(update).length > 0) {
      org.objects
        .c_public_users
        .updateOne({ _id }, { $set: update })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }

  },

  setPublicuserSearchTerms(_id) {
    const compareArrays = (A, B) => A.length === B.length && A.every(e => B.includes(e))
    const c_search = []

    // Using script.as to ensure grant passes down the expand
    const public_user = script.as(script.principal._id, { principal: { grant: consts.accessLevels.read, skipAcl: true } }, () => {
      let pu
      try {
        pu = org.objects
          .c_public_users
          .find({ _id })
          .paths('c_search', 'c_email', 'c_number', 'c_account.name', 'c_account.email', 'c_study.c_format_spec_subject_id')
          .passive()
          .next()
      } catch (err) {

      }
      return pu
    })

    if (public_user) {
      c_search.push(public_user._id.toString())
      if (public_user.c_account) {
        if (public_user.c_account.email) {
          c_search.push(public_user.c_account.email)
          c_search.push(public_user.c_account.email.split('@')[1]) // email domain
        }
        c_search.push(`${public_user.c_account.name.first} ${public_user.c_account.name.last}`)
        c_search.push(`${public_user.c_account.name.last} ${public_user.c_account.name.first}`)
        c_search.push(`${public_user.c_account.name.last}, ${public_user.c_account.name.first}`)
      } else if (public_user.c_email) {
        c_search.push(public_user.c_email)
        c_search.push(public_user.c_email.split('@')[1]) // email domain
      }

      if (public_user.c_number) {
        c_search.push(public_user.c_number)
        try {
          // try catch here just in case the format spec on the study is unset
          c_search.push(this.getNumberFromFormatSpec(public_user.c_number, public_user.c_study.c_format_spec_subject_id))
        } catch (err) {

        }

      }

      // finally we only update if the arrays are different
      if (!compareArrays(c_search, public_user.c_search)) {
        org.objects.c_public_users.updateOne({ _id }, { $set: { c_search } })
          .skipAcl()
          .grant(consts.accessLevels.update)
          .execute()
      }

    }

    return c_search
  },

  getQuerySearchTerms(query) {

    let search = []
    const pi = query.creator.c_public_identifier || undefined

    if (pi) {
      search.push(pi.toLowerCase())
      search = search.concat(query.creator.c_public_identifier.toLowerCase()
        .split(' '))
    }

    search.push((query.c_task_response && query.c_task_response.c_task && query.c_task_response.c_task.c_name) || undefined)
    search.push((query.c_subject && query.c_subject.c_number) || undefined)
    search.push(query.c_number)
    search.push(query.c_description.substring(0, 20))

    // add this search only if  specified in study
    if (query.c_study.c_format_spec_queries) {
      search.push(this.getNumberFromFormatSpec(query.c_number, query.c_study.c_format_spec_queries))
    }

    return search
    // remove undefined, nulls, emptys
      .filter(s => { return (s !== 'undefined') && (s !== '') && (s) })
    // Lowercase all values
      .map(x => x.toLowerCase())
    // unique values only
      .filter((v, i, a) => { return a.indexOf(v) === i })
  },

  updateQuerySearchTerms(queryUpdate) {
    // const query =  script.as(this.SystemUser.name,{}, () => { return org.objects.c_queries.find({_id: queryUpdate._id}).skipAcl().grant(6).expand(['updater', 'creator', 'c_study', 'c_task_response.c_task']).next()})

    const query = script.as(this.SystemUser.name, {}, () => {

      return org.objects.c_queries.find({ _id: queryUpdate._id })
        .skipAcl()
        .grant(6)
        .passive()
        .paths([
          'updater.c_public_identifier',
          'creator.c_public_identifier',
          'c_study.c_format_spec_queries',
          'c_task_response.c_task.c_name',
          'c_search',
          'c_description',
          'c_number',
          'c_subject.c_number'
        ])
        .next()

    })

    let search = query.c_search || []

    if (search.length === 0) {
      search = search.concat(this.getQuerySearchTerms(query))
    }

    if (query.updater && query.updater.c_public_identifier && !query.c_search.includes(query.updater.c_public_identifier.toLowerCase()) && !search.includes(query.updater.c_public_identifier.toLowerCase())) {

      search.push(query.updater.c_public_identifier.toLowerCase())

      search = search.concat(query.updater.c_public_identifier.toLowerCase()
        .split(' '))
    }

    return search
    // remove undefined, nulls, emptys
      .filter(s => { return (s !== 'undefined') && (s !== '') && (s) })
    // Lowercase all values
      .map(x => x.toLowerCase())
    // unique values only
      .filter((v, i, a) => { return a.indexOf(v) === i })
  },

  removeDefaultProps(entity) {
    for (const key in entity) {
      if (key === 'data' || key.startsWith('c_') || !isNaN(Number(key))) {
        if (entity[key] instanceof Object) {
          if (entity[key].path) {
            delete entity[key]
          } else {
            entity[key] = this.removeDefaultProps(entity[key])
          }
        }
      } else {
        delete entity[key]
      }
    }
    return entity
  },

  canApprovePublicUser(publicUserID) {
    const taskResponses = org.objects.c_task_responses
      .find({ c_public_user: publicUserID, c_status: { $in: ['New', 'Complete', 'Incomplete'] } })
      .paths('c_task._id', 'c_status')
      .skipAcl()
      .grant(consts.accessLevels.read)

    // Return false if any task response is in Incomplete status (which usually means it has a query open)
    const incompleteTaskResponses = taskResponses.filter(tr => tr.c_status === 'Incomplete')
    if (incompleteTaskResponses.length > 0) {
      return false
    }

    const taskIds = _.uniq(taskResponses.map(tr => tr.c_task._id.toString()))

    const configuredNewReviewTypes = org.objects.c_review_type
      .find({ c_task_list: { $in: taskIds }, c_active: true })
      .paths('_id')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    const study = org.objects
      .c_study
      .find()
      .paths('c_review_types')
      .skipAcl()
      .grant('read')
      .next()

    const oldReviewsTypes = study.c_review_types || []

    const allReviewTypes = [...configuredNewReviewTypes, ...oldReviewsTypes]
    const hasReviewsConfigured = allReviewTypes.length > 0

    if (!hasReviewsConfigured) {
      return true
    }

    // If any task responses (except Inactive) submitted by a site -- linked to a c_group_task with c_required_reviews > 0 -- have a c_status other than "Reviewed" return false
    const hasUnreviewedTaskResponses = org.objects.c_task_responses
      .find({ c_status: { $in: ['New', 'Complete'] }, c_public_user: publicUserID })
      .paths('c_status', 'c_task', 'c_group')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .transform({
        autoPrefix: true,
        script: `
        each(taskResponse) {

          const groupTask = org.objects.c_group_task
            .readOne({ c_assignment: taskResponse.c_task._id, c_group: taskResponse.c_group._id })
            .paths('c_required_reviews')
            .grant(consts.accessLevels.read)
            .throwNotFound(false)
            .execute()
          const oldReviews = (groupTask && groupTask.c_required_reviews) || []
          const newReviewTypes = org.objects.c_review_type
            .find({ c_task_list: { $in: [taskResponse.c_task._id.toString()] }, c_active: true })
            .paths('_id')
            .skipAcl()
            .grant(consts.accessLevels.read)
            .toArray()
          const allReviewTypes = [...newReviewTypes.map(rt => rt._id), ...oldReviews]

          if (allReviewTypes.length > 0) {
            return taskResponse
          }
        }
        `
      })
      .toArray()

    if (hasUnreviewedTaskResponses.length) {
      return false
    }

    return true
  },

  setPublicUserStatusFromStepRespValue(stepResp, publicUserId) {
    if (stepResp) {
      if (typeof stepResp.c_value === 'boolean') {
        const statusValue = (stepResp.c_value && 'Completed') || 'Discontinued'
        script.as(this.SystemUser.name, {}, () => {
          return c_public_users.updateOne({ _id: publicUserId }, { $set: { c_status: statusValue } })
            .lean(false)
            .execute()
        })
      }
    }
  },

  setPublicUserStatusFromTaskResp(taskResponse) {
    const screenFailedTaskName = 'Screen Failure'
    const completionStatusTaskName = 'Completion Status'
    const completionStepName = 'Has the subject completed the trial'

    if (taskResponse.c_task.c_name === screenFailedTaskName) {
      script.as(this.SystemUser.name, {}, () => {
        return c_public_users.updateOne({ _id: taskResponse.c_public_user._id }, { $set: { c_status: 'ScreenFailed' } })
          .lean(false)
          .execute()
      })
    } else if (taskResponse.c_task.c_name === completionStatusTaskName) {
      const stepResp = taskResponse.c_step_responses.data.find(sr => sr.c_step.c_name === completionStepName)
      this.setPublicUserStatusFromStepRespValue(stepResp, taskResponse.c_public_user._id)
    }
  },

  // Recomputes and updates the TR status based on it's
  // open/closed/responded/cancelled queries
  updateTaskResponseStatus(trId) {

    const setStatement = { $set: {} }

    const { QueryStatus } = require('c_nucleus_query')

    const trc = org.objects.c_task_response
      .find({ _id: trId })
      .paths('c_status', 'c_group', 'c_task', 'c_reviews', 'c_study')
      .skipAcl()
      .grant(consts.accessLevels.read)

    const taskResponse = (trc.hasNext() && trc.next()) || null

    if (taskResponse && taskResponse.c_status !== 'Inactive') {

      // Incomplete === is there at least one open for that task
      const queries = org.objects.c_query
        .find({
          c_task_response: trId,
          c_status: { $in: [QueryStatus.Open, QueryStatus.Responded] }
        })
        .paths('_id')
        .skipAcl(1)
        .grant(consts.accessLevels.read)
        .toArray()

      const taskResponseNextStatus = queries.length ? 'Incomplete' : this.calculateCompletionTaskResponseStatus(taskResponse)

      // Update the task only if it is a status different from the current one
      if (taskResponse.c_status !== taskResponseNextStatus) {

        setStatement.$set = { ...setStatement.$set, c_status: taskResponseNextStatus }

      }

      if (TaskResponse.isPropPresent('c_clean_status')) {

        const cleanStatus = TaskResponse.calculateCurrentCleanStatus(trId, { taskResponse, queries })

        setStatement.$set = { ...setStatement.$set, c_clean_status: cleanStatus }

      }

      script.as(nucPermissions.SystemUser.name, {}, () => {
        org.objects.c_task_responses
          .updateOne({ _id: trId }, setStatement)
          .lean(true)
          .execute()
      })
    }
  },

  // this method has to maintain backwards compatibility with studies without reviews
  calculateCompletionTaskResponseStatus(taskResponse) {

    // tradionally endStatus is Complete
    let endStatus = 'Complete'

    const { c_task: task, c_group: group, c_study: study } = taskResponse

    if (!study) return endStatus

    const [studyInstance] = org.objects
      .c_study
      .find({ _id: study._id })
      .paths('c_review_types')
      .skipAcl()
      .grant('read')
      .toArray()

    const oldReviewsTypes = studyInstance.c_review_types || []

    const allReviewTypes = this.fetchNewReviewTypes(task._id, oldReviewsTypes)
    const hasReviewsConfigured = allReviewTypes.length > 0

    // if there are no reviews configured then we assume study is not using the new review system
    // therefore the traditional "end status" of a TR is still 'Complete'
    if (!studyInstance || !hasReviewsConfigured) return endStatus

    if (!task || !group) return endStatus

    const [groupTask] = org.objects
      .c_group_tasks
      .find({ c_assignment: task._id, c_group: group._id })
      .paths('c_required_reviews')
      .skipAcl()
      .grant('read')
      .toArray()

    const newReviewType = org.objects.c_review_type
      .find({ c_task_list: { $in: [task._id.toString()] }, c_active: true })
      .paths('_id')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()
    const newRvType = _.map(newReviewType, _.property('_id'))

    const checkAllReviews = [...newRvType]

    const requiresReviews = checkAllReviews.length > 0 || (groupTask.c_required_reviews && groupTask.c_required_reviews.length > 0)

    // if it is using reviews but this group task particularly doesn't have configured
    // required reviews then we simply set the TR to 'Reviewed'
    if (!requiresReviews) {
      endStatus = 'Reviewed'
    }

    return endStatus
  },

  swap(json) {
    const ret = {}
    for (const key in json) {
      ret[json[key]] = key
    }
    return ret
  },

  setPublicUserStatusFromTaskResponse(taskResponseId, success, publicUserID) {
    const c_task_response = org.objects.c_task_response
            .find({ _id: taskResponseId })
            .skipAcl()
            .grant(consts.accessLevels.delete)
            .include('c_task')
            .next(),
          c_task = org.objects.c_task
            .find({ _id: c_task_response.c_task._id })
            .skipAcl()
            .grant(consts.accessLevels.delete)
            .next(),
          statusPropertyName = success ? 'c_set_subject_status_success' : 'c_set_subject_status_failure',
          taskStatus = c_task[statusPropertyName]

    if (!taskStatus) return false

    org.objects.c_public_user
      .updateOne({ _id: publicUserID }, { $set: { c_status: taskStatus } })
      .skipAcl()
      .grant(consts.accessLevels.delete)
      .execute()
  },

  setTaskAssignmentOrder(c_group, taskAssignments) {

    const currentTaskAssignments = c_group_tasks.find({ c_group })
      .paths('c_order')
      .toArray()

    taskAssignments.forEach(taskAssignment => {
      const cta = currentTaskAssignments.find(v => v._id.equals(taskAssignment._id))
      if (cta && cta.c_order !== taskAssignment.c_order) {
        c_group_tasks.updateOne({ _id: cta._id }, { $set: { c_order: taskAssignment.c_order } })
          .skipAcl()
          .grant(consts.accessLevels.update)
          .execute()
      }
    })

    return c_group_tasks.find({ c_group })
      .paths('c_order', 'c_assignment.c_name', 'c_schedule')
      .sort({ c_order: 1 })
  },

  // utility function to sort task assignments by order and then c_assignment name if no order set
  // currently all tasks assignment are displayed alphabetically so when adding orders that currently aren't set
  // we're going to set the order to something predictable, hence this function
  sortTaskAssignments(a, b) {
    const textA = a.c_assignment && a.c_assignment.c_name && a.c_assignment.c_name.toUpperCase()
    const textB = b.c_assignment && b.c_assignment.c_name && b.c_assignment.c_name.toUpperCase()
    if (a.c_order && b.c_order) {
      return a.c_order - b.c_order
    } else if (a.c_order) {
      return 1
    } else if (b.c_order) {
      return -1
    } else if (textA && textB) {
      return (textA < textB) ? -1 : (textA > textB) ? 1 : 0
    } else {
      return 1
    }
  },

  // Fetch new review type from c_review_type
  fetchNewReviewTypes(taskId, oldReviewTypes) {
    const newReviewTypes = org.objects.c_review_type
      .find({ c_task_list: { $in: [taskId.toString()] }, c_active: true })
      .paths('_id', 'c_roles', 'c_active', 'c_key', 'c_name', 'c_required_signature')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()
    return [...oldReviewTypes, ...newReviewTypes]
  }
}