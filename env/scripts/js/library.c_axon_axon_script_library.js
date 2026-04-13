/***********************************************************

@script     Axon - Script Library

@brief      Utility functions used in Axon scripts

@author     Matt Lean     (Medable.MIL)

@version    4.3.2

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import faults from 'c_fault_lib'
import config from 'config'
import { on } from 'decorators'

const moment = require('moment'),
      logger = require('logger'),
      objects = require('objects'),
      connections = require('connections'),
      { c_task_responses, c_step_responses, c_studies, c_groups } = org.objects,
      statusCodeMap = {
        400: 'kInvalidArgument',
        403: 'kAccessDenied',
        404: 'kNotFound',
        500: 'kError'
      }

// Implements public user linking logic as events that can be executed asynchronously.
class AxonEventHandlers {

  // Dispatches events to link public user task and step responses to the specified public user and account.
  @on('axon__link_public_user_responses')
  static linkPublicUserResponses({ publicUser, accountId, existingPublicUserIds }) {
    const update = {
      c_account: accountId,
      c_public_user: publicUser._id
    }
    if (publicUser.c_site) {
      update.c_site = publicUser.c_site._id
    }

    const taskResponseIds = c_task_responses
            .find({ c_public_user: { $in: existingPublicUserIds } })
            .paths('_id')
            .limit(1000)
            .skipAcl()
            .grant(consts.accessLevels.read)
            .map(tr => tr._id),
          stepResponseIds = c_step_responses
            .find({ c_public_user: { $in: existingPublicUserIds } })
            .paths('_id')
            .limit(1000)
            .skipAcl()
            .grant(consts.accessLevels.read)
            .map(sr => sr._id),
          linkTaskResponseEvents = taskResponseIds
            .map(function(_id) {
              return {
                type: 'script',
                event: 'axon__link_task_response',
                principal: script.principal,
                param: {
                  _id,
                  update,
                  newOwner: accountId
                }
              }
            }),
          linkStepResponseEvents = stepResponseIds
            .map(function(_id) {
              return {
                type: 'script',
                event: 'axon__link_step_response',
                principal: script.principal,
                param: {
                  _id,
                  update,
                  newOwner: accountId
                }
              }
            }),
          eventsToInsert = [...linkTaskResponseEvents, ...linkStepResponseEvents],
          insertedEvents = org.objects.events.insertMany(eventsToInsert)
            .grant('update')
            .bypassCreateAcl()
            .execute()

    return insertedEvents
  }

  // Link a task response to a new owner, and update specified props.
  @on('axon__link_task_response')
  static linkTaskResponse({ _id, newOwner, update }) {
    c_task_responses.setOwner(_id, newOwner)
    return c_task_responses.updateOne({ _id }, { $set: update })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .lean(true)
      .execute()
  }

  // Link a step response to a new owner, and update specified props.
  @on('axon__link_step_response')
  static linkStepResponses({ _id, newOwner, update }) {
    c_step_responses.setOwner(_id, newOwner)
    return c_step_responses.updateOne({ _id }, { $set: update })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .lean(true)
      .execute()
  }

}

module.exports = {

  generateRandomDigitSequence(length) {
    const lower = Math.pow(10, length - 1),
          max = Math.pow(10, length) - lower

    return (Math.floor(Math.random() * max) + lower).toString()
  },

  generateAlphaNumericCode(codeLength = 6) {
    const allowedChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let code = ''
    for (let i = codeLength; i > 0; i--) {
      code += allowedChars[Math.floor(Math.random() * allowedChars.length)]
    }
    return code
  },

  getAppKey() {
    const apps = org.objects.org.find()
            .paths('apps')
            .skipAcl()
            .grant(consts.accessLevels.read)
            .next().apps,
          sessionApps = apps.filter(app => app.clients[0].sessions && app.clients[0].enabled)

    return (sessionApps.length && sessionApps[0].clients[0].key) || ''
  },

  createStudyConnection(options) {
    const { email, account, study } = options,
          appKey = module.exports.getAppKey()

    let connection

    if (email) {
      const targets = [{ email, roles: [consts.roles['Study Participant']] }]
      connection = connections.create('c_study', study, targets, { skipAcl: true, grant: consts.accessLevels.delete, skipNotification: true, connectionAppKey: appKey })
    } else if (account) {
      const targets = [{ _id: account, roles: [consts.roles['Study Participant']], auto: true }]
      connection = connections.create('c_study', study, targets, { skipAcl: true, grant: consts.accessLevels.delete, skipNotification: true, connectionAppKey: appKey })

    }

    return connection
  },

  // checkGroupInGroups: Check if group is within an array of groups
  checkGroupInGroups(groups, group) {
    for (const i in groups) {
      const currGroup = String(groups[i]._id)

      if (String(group) === currGroup) {
        return groups[i]
      }
    }

    return false
  },

  // checkPastInvites: Check if there are invites generated in the past for the given email
  checkPastInvites(publicUsers, publicUser) {
    if (publicUsers.length > 0) {
      for (const i in publicUsers) {
        const currPublicUser = publicUsers[i]

        if (publicUser) {
          if (String(publicUser._id) === String(currPublicUser._id)) {
            continue
          }
        }

        if (!currPublicUser.c_group || !currPublicUser.c_invite) {
          continue
        } else {
          return currPublicUser
        }
      }
    }

    return false
  },

  // createResearchData: Create research data object. Mainly for testing purposes.
  createResearchData(study, date, data) {
    const researchData = objects.list('c_research_data', {
      where: {
        c_date: date,
        c_study: study
      },
      limit: 1
    })

    if (researchData.data.length > 0) {
      faults.throw('axon.invalidArgument.researchDataExists')
    } else {
      objects.create('c_research_data', data)
    }
  },

  // findAllGroup: Find 'All' group in list of groups
  findAllGroup(c_study) {
    // return the study's default group
    const study = c_studies.find({ _id: c_study })
      .paths('c_default_subject_group')
      .expand('c_default_subject_group')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next()

    if (!study.c_default_subject_group) {
      const group = this.findStudyGroupByName(c_study, 'All')

      if (group) {
        c_studies.updateOne({ _id: c_study }, { $set: { c_default_subject_group: group._id } })
          .skipAcl()
          .grant(consts.accessLevels.delete)
          .execute()
      }

      return group

    } else {
      return study.c_default_subject_group
    }
  },

  // findPublicGroup: Find 'Public' group in list of groups
  findPublicGroup(c_study) {
    // return the study's default group
    const study = c_studies.find({ _id: c_study })
      .paths('c_public_group')
      .expand('c_public_group')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next()

    if (!study.c_public_group) {

      const group = this.findStudyGroupByName(c_study, 'Public')

      if (group) {
        c_studies.updateOne({ _id: c_study }, { $set: { c_public_group: group._id } })
          .skipAcl()
          .grant(consts.accessLevels.delete)
          .execute()
      }

      return group

    } else {
      return study.c_public_group
    }
  },

  findStudyGroupByName(c_study, name) {
    // if not find it the old fashioned way and set it correctly
    const groupCursor = c_groups.find({ c_study, c_name: name })
      .locale('en_US')
      .skipAcl()
      .grant(consts.accessLevels.read)
    if (groupCursor.hasNext()) {
      const group = groupCursor.next()

      return group
    } else {
      // the old fashioned way didn't work
      const studyGroups = c_groups.find({ c_study })
        .include('locales')
        .skipAcl()
        .grant(consts.accessLevels.read)
        .toArray()

      const foundGroup = studyGroups.find(v => {
        return v.locales.c_name && v.locales.c_name.find(l => l.value === name)
      })

      return foundGroup
    }
  },

  // getResearchData: Return research data object for the study and date.
  //                  If it doesn't exist, return null.
  getResearchData(study, date) {
    const researchData = objects.list('c_research_data', {
      where: {
        c_date: date,
        c_study: study
      },
      limit: 1
    })

    if (researchData.data.length > 0) {
      return researchData.data[0]
    }

    return null
  },

  // Schedules linking of public user responses to new account id.
  linkPublicUserResponses(publicUser, accountId, existingPublicUserIds) {
    const allUsers = Array.from(existingPublicUserIds)
    allUsers.push(publicUser._id)

    org.objects.events
      .insertOne({
        type: 'script',
        event: 'axon__link_public_user_responses',
        principal: script.principal,
        param: {
          publicUser,
          accountId,
          existingPublicUserIds: allUsers
        }
      })
      .grant('update')
      .bypassCreateAcl()
      .execute()
  },

  // track: Track statistics for study
  track(type, study, val) {
    let now = moment.utc(),
        nowClone = moment(now),

        researchDataCheck = objects.list('c_research_data', {
          where: {
            $and: [
              {
                c_datetime: {
                  $gte: nowClone.startOf('hour')
                    .toISOString()
                }
              },
              {
                c_datetime: {
                  $lt: nowClone.add(1, 'hours')
                    .toISOString()
                }
              }
            ],
            c_type: type
          },
          limit: 1,
          grant: 7,
          skipAcl: true
        }).data,

        researchData,
        newVal

    if (researchDataCheck.length > 0) {
      researchData = researchDataCheck[0]

      newVal = researchData.c_value ? researchData.c_value : 0
      if (val) {
        newVal = val
      } else {
        ++newVal
      }

      researchData = objects.update('c_research_data', researchData._id, {
        c_value: newVal
      }, { grant: 7, skipAcl: true })
    } else {
      newVal = val || 1

      researchData = org.objects.c_research_data.insertOne({
        c_datetime: now.toISOString(),
        c_study: study,
        c_type: type,
        c_value: newVal
      })
        .skipAcl(true)
        .grant(7)
        .execute()
    }

    return researchData
  },

  genError(reason, statusCode = 500) {
    const faultCode = statusCodeMap[statusCode] || 'kError'
    throw Fault.create(faultCode, { reason, statusCode })
  },

  getPatientAppWebURL() {
    const { patientAppUrls } = config.get('axon__paweb_urls') || {},
          currentOrg = org.objects
            .orgs.find()
            .skipAcl()
            .grant('read')
            .paths('code')
            .next().code,
          appUrl = patientAppUrls && patientAppUrls.find(v => v.env === script.env.host).url
    return appUrl.includes(`/?org=${currentOrg}`) ? appUrl : appUrl + `/?org=${currentOrg}`
  },

  getSiteAppParticipantUrl(publicUserId) {
    const { siteAppUrls } = config.get('axon__siteapp_urls') || {}
    const app = siteAppUrls && siteAppUrls.find(v => v.env === script.env.host)
    const appUrl = app && app.url

    return `${appUrl}/participants/${publicUserId}`
  },

  findMobileAppLinks(envHost) {
    const host = typeof envHost === 'undefined' ? script.env.host : envHost

    const { patientAppUrls } = config.get('axon__mobile_urls') || {}

    const matchedApp = patientAppUrls.find(v => v.env === host) || patientAppUrls.find(v => v.env === '*')

    const googleStore_url = matchedApp.android
    const appleStore_url = matchedApp.ios
    const isChina = typeof googleStore_url === 'undefined'
    return { googleStore_url, appleStore_url, isChina }
  },
  findMobileAppVersion() {
    const googleStore = true, appleStore = true, downloadText = true
    // try {
    //   const apps = org.objects
    //     .c_axon_mobile_app_version
    //     .find()
    //     .skipAcl()
    //     .grant('read')
    //     .paths('c_application')
    //     .map(app => app.c_application)
    //   if (apps.length > 0) {
    //     googleStore = apps.includes('patandroid')
    //     appleStore = apps.includes('patios')
    //     downloadText = googleStore || appleStore
    //   }
    // } catch (error) {
    //   if (error.code === 'kInvalidObject') {
    //     appleStore = true
    //     googleStore = true
    //     downloadText = true
    //   } else {
    //     throw error
    //   }
    // }

    return { downloadText, appleStore, googleStore }
  },
  isPAWEnabled() {
    const apps = org.objects.org.find()
      .paths('apps')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next().apps
    const paweb = apps.filter(app => app.name && app.name === 'c_mystudy')

    return paweb && paweb.length && paweb[0].enabled
  }

}