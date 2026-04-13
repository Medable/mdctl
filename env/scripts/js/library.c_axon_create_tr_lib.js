/***********************************************************

@script     Axon - Create Task Response Managment Library

@brief      Lib to create the task response and child step
            responses. Checks for duplicate task responses
            and handles accordingly

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import {
  route,
  log,
  as
} from 'decorators'
import response from 'response'
import { principals } from 'consts'
import _ from 'underscore'
import { SystemUser } from 'c_nucleus_utils'
import { genError } from 'c_axon_script_lib'
import logger from 'logger'
import base64 from 'base64'
import moment from 'moment'
import ParticipantIDLibrary from 'c_axon_participant_id_lib'
import faults from 'c_fault_lib'

const { c_task_responses, c_step_responses, objects, c_public_users, accounts } = org.objects

const observationAppMap = {
  c_android_patient_app: 'epro',
  c_ios_patient_app: 'epro',
  c_mystudy: 'epro',
  c_site_app_demo: 'clinro',
  c_ios_site_app: 'clinro'
}

export class TaskResponseCreator {

  /**
   * @openapi
   * /create_task_response:
   *  post:
   *    description: 'create task response'
   *    parameters:
   *      - name: client
   *        in: query
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              c_task_response:
   *                type: string
   *              c_site:
   *                type: string
   *                description: Site ID
   *
   *    responses:
   *      '200':
   *        description: returns a c_task_response object
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/components/schemas/c_task_response'
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'create_task_response',
    path: 'create_task_response',
    authValidation: 'all',
    weight: 10,
    acl: [
      'account.anonymous'
    ]
  })
  static responseCreationRoute({ body, req }) {

    const { c_task_response, c_site } = body()
    const { client } = req
    let principalId = script.principal._id

    // AXONCONFIG-1628: When an anonymous request includes a c_account_id, treat it
    // as a session expiry.  Replace this workaround when CTXAPI-932 is closed.
    if (principalId.equals(principals.anonymous) && c_task_response.c_account) {
      response.setStatusCode(403)
      return {
        object: 'fault',
        name: 'sessions',
        code: 'kSessionExpired',
        errCode: 'cortex.accessDenied.sessionExpired',
        status: 403,
        message: 'Your session has expired.'
      }
    }

    // AXONCONFIG-5113: Check if the task is a site-investigator-only task
    const c_study_pinned_version = this.getStudyPinnedVersion()
    if (c_study_pinned_version >= 40200) {
      // NOT A REAL SITE INVESTIGATOR ROLE CODE.
      // Migrated from monorepo - https://gitlab.medable.com/product/web/mfw/monorepo/-/blob/main/medable/apps/study_management/src/constants/site_roles.constants.ts?ref_type=heads#L3
      const site_investigator_role = 'site_investigator'

      const c_task = org.objects.c_task.find({ _id: c_task_response.c_task })
        .paths('c_roles')
        .skipAcl()
        .grant(consts.accessLevels.read)
        .next()

      const principal_roles = script.principal.roles ? script.principal.roles.map(role => role.toString()) : []
      const is_site_investigator_only_task = c_task.c_roles.length === 1 && c_task.c_roles[0].toString() === site_investigator_role
      const is_site_investigator = principal_roles.includes(consts.roles.c_axon_site_investigator.toString())

      if (is_site_investigator_only_task && !is_site_investigator) {
        faults.throw('axon.accessDenied.cannotSubmitSiteInvestigatorTask')
      }
    }

    this.validateParameters(c_task_response, c_site, principalId)

    // The owner of the response will change (if created in the site-app). This means that creator will
    // no longer have direct read access after creation. In order not to cause an error so we need our
    // grant at a higher level using script.as whether it's an anonymous call or not.
    if (principalId.equals(principals.anonymous)) {
      principalId = SystemUser.name
    }

    return this.creationProcess(c_task_response, c_site, principalId, client)

  }

  static creationProcess(c_task_response, c_site, principalId, client) {

    const { c_uuid } = c_task_response
    c_task_response = this.updateCreationData(c_task_response, c_site, client)
    const { creator: { _id: responseCreator } } = this.createResponse(c_task_response, principalId)
    return this.getReturnData(responseCreator, c_uuid)
  }

  static uniqueIdentifierForStepResponse(c_step_response, c_task_response) {
    if (c_step_response.type === 'c_active_task') {
      return `${c_task_response.c_uuid}-${c_step_response.c_value[0].c_filename}`
    }
    return `${c_task_response.c_uuid}-${c_step_response.c_step}`
  }

  static updateCreationData(c_task_response, c_site, client) {
    if (c_site) {
      c_task_response = Object.assign({}, c_task_response)
      c_task_response.c_site = c_site
    }

    c_task_response.c_step_responses = c_task_response.c_step_responses.map(v => {

      if (c_site) {
        v.c_site = c_site
      }

      // setting a unique ID on SR so we can de-duplicate them
      v.c_unique_identifier = this.uniqueIdentifierForStepResponse(v, c_task_response)
      return v
    })

    this.setObservationType(c_task_response, client)

    this.setSequenceNumber(c_task_response)

    return c_task_response
  }

  static setObservationType(c_task_response, client) {

    // first set the observation type based on the client app
    let observation = client && observationAppMap[client.name]

    if (c_task_response.c_task) {
      const task = org.objects.c_task.readOne({ _id: c_task_response.c_task })
        .throwNotFound(false)
        .skipAcl()
        .paths('c_observation_type')
        .passive(true)
        .grant(consts.accessLevels.read)
        .execute()

      // only update if the task has the observation set
      if (task && task.c_observation_type) {
        observation = task.c_observation_type
      }

    }

    // and only try to set the value if there is a value there
    if (observation) {
      c_task_response.c_observation_type = observation
    }

  }

  static validateParameters(c_task_response, c_site, principalId) {
    if (!c_task_response) genError('You must provide a task response', 400)
    if (!c_task_response.c_study) genError('You must provide a valid c_study parameter in the task response body', 400)

    ParticipantIDLibrary.validateParticipantIDBeforeTaskResponseCreation(c_task_response)

    // AXONCONFIG-345: When an anonymous request includes a c_account_id, treat it
    // as a session expiry.  Replace this workaround when CTXAPI-266 is closed.
    if (principalId.equals(principals.anonymous) && c_task_response.c_account) {
      response.setStatusCode(403)
      return {
        object: 'fault',
        name: 'sessions',
        code: 'kSessionExpired',
        errCode: 'cortex.accessDenied.sessionExpired',
        status: 403,
        message: 'Your session has expired.'
      }
    }

    // if the site is provided add it to the response bodies
    if (c_site) {
      c_task_response = Object.assign({}, c_task_response)
      c_task_response.c_site = c_site
      c_task_response.c_step_responses = c_task_response.c_step_responses.map(v => {
        v.c_site = c_site

        return v
      })
    }

    if (!c_task_response.c_uuid) {
      // TODO: Move to the new fault lib, in 4.16 we will support passing path property to this
      // also notice that the  whole implementation uses genError instead of the new lib
      // and behind the scenes this genError calls Fault.create so this is not too far off from the current logic
      throw Fault.create('cortex.validation.kRequired', { path: 'c_task_response.c_uuid' })
    }

  }

  static createResponse(c_task_response, principalId) {
    return script.as(principalId, { principal: { skipAcl: true, grant: consts.accessLevels.script }, acl: { safe: false }, modules: { safe: false } }, () => {
      // copy the input object so we can mess with it
      let trCreate = Object.assign({}, c_task_response)
      const c_completed = c_task_response.c_completed

      trCreate = this.setResponseLocaleAndTz(trCreate)

      // remove the step responses from the input and create the task Response
      delete trCreate.c_step_responses
      // in order to trigger the Query update on completion we will set the c_completed value at the end
      if (c_completed) {
        delete trCreate.c_completed
      }

      // We attempt to create the task response. If that fails due to duplication of the UUID,
      // we grab the existing TR and expand the step responses
      let tr
      try {
        tr = c_task_responses.insertOne(trCreate)
          .lean(false)
          .execute()
      } catch (err) {
      // if fault isn't because of duplicate uuids, return it
        if (!(err.faults && err.faults[0].code === 'kDuplicateKey' && err.faults[0].path === 'c_uuid')) {
          throw err // TODO: Is this the correct action given it's behaviour in the original
        } else {
          tr = c_task_responses.find({ c_uuid: trCreate.c_uuid })
            .expand('c_step_responses')
            .next()
          logger.info(`TR ${tr.c_uuid} already exists, resuming partial upload`)
        }
      }

      this.createStepResponses(c_task_response, tr)

      if (c_completed) {
        c_task_responses.updateOne({ _id: tr._id }, { $set: { c_completed } })
          .execute()
      }

      return tr
    })
  }

  static createStepResponses(c_task_response, tr) {
    // Update the step responses with the new task response ID and create those too
    let stepResponses = c_task_response.c_step_responses.map(v => {
      v.c_task_response = tr._id
      return v
    })

    // Now if the task response has step responses we need to check all of them are in place
    // and insert the ones that aren't.
    if (tr.c_step_responses && tr.c_step_responses.data.length) {
      // only return the step responses for creation that don't exist in the TR
      const existingSteps = tr.c_step_responses.data.reduce((m, sr) => { m[sr.c_unique_identifier] = true; return m }, {})
      stepResponses = stepResponses.filter(sr => !existingSteps[this.uniqueIdentifierForStepResponse(sr, c_task_response)])
    }

    if (!stepResponses.length) {
      return
    }

    const results = c_step_responses.insertMany(stepResponses)
      .execute()

    if (results.insertedCount === stepResponses.length) {
      return
    }

    // Throw unknown error, client will retry upload.
    throw Fault.create({
      faults: results.writeErrors
    })
  }

  // If the task response has step response file uploads pending this will return the necessary upload info only
  static getReturnData(responseCreator, c_uuid) {
    const stepResponseTypeFiles = this.getStepRespTypesWithFiles()
    return script.as(responseCreator, { principal: { grant: consts.accessLevels.script, skipAcl: true }, modules: { safe: false } }, () => {
      const response = c_task_responses.find({ c_uuid })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .expand('c_event')
        .paths('_id', 'object', 'c_step_responses', 'c_uuid', 'c_event')
        .passive()
        .next()
        // Expansion of the step responses isn't enough to ensure you have all of them
      response.c_step_responses = {
        data: c_step_responses.find({ c_task_response: response._id })
          .limit(1000)
          .toArray()
      }
      response.c_step_responses.data = response.c_step_responses.data.reduce((a, v) => {
        const ot = stepResponseTypeFiles.find(srt => srt.objType === v.type)
        if (ot && v[ot.propName]) {
          let returning = false,
              refreshing = false

          // active task types require specific attention
          if (ot.objType === 'c_active_task') {

            const c_value = v[ot.propName]
            c_value.forEach(val => {
              val.c_file.forEach(file => {
                if (file.state === consts.media.states.pending) {
                  returning = true

                  if (this.uploadExpired(file)) {
                    refreshing = true
                    this.refreshUpload(v._id, `c_value.${val._id}.c_file.${file._id}`)
                  }

                } else if (file.state === consts.media.states.error || file.state === consts.media.states.dead) {
                  refreshing = true
                  this.refreshUpload(v._id, `c_value.${val._id}.c_file.${file._id}`)
                }
              })
            })
          } else {
            if (v[ot.propName].state === consts.media.states.pending) {
              returning = true
              if (this.uploadExpired(v[ot.propName])) {
                refreshing = true
                this.refreshUpload(v._id, ot.propName)
              }
            } else if (v[ot.propName].state === consts.media.states.error || v[ot.propName].state === consts.media.states.dead) {
              // refresh the file upload info
              refreshing = true
              this.refreshUpload(v._id, ot.propName)
            }
          }

          if (returning && !refreshing) {
            a.push(_.pick(v, '_id', 'object', 'type', ot.propName))
          } else if (refreshing) {
            const step = c_step_responses.find({ _id: v._id })
              .next()
            a.push(_.pick(step, '_id', 'object', 'type', ot.propName))
          }
        }
        return a
      }, [])
      return response
    })
  }

  static setResponseLocaleAndTz(c_task_response) {

    if (script.locale) {
      c_task_response.c_locale = script.locale
    } else {
      c_task_response.c_locale = 'en_US'
    }

    if (!c_task_response.c_tz) {
      let _id, object, property = null
      if (_.has(c_task_response, 'c_account')) {
        _id = _.isObject(c_task_response.c_account) ? c_task_response.c_account._id : c_task_response.c_account
        property = 'tz'
        object = accounts
      } else if (_.has(c_task_response, 'c_public_user')) {
        _id = _.isObject(c_task_response.c_public_user) ? c_task_response.c_public_user._id : c_task_response.c_public_user
        property = 'c_tz'
        object = c_public_users
      }
      if (_id) {
        const cursor = object.find({ _id })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .paths(property)
        if (cursor.hasNext()) {
          const user = cursor.next()
          if (user[property]) {
            c_task_response.c_tz = user[property]
          }
        }
      }
    }
    return c_task_response
  }

  // decode the file upload policy to determine the expiry
  static uploadExpired(file) {
    const now = moment(),
          expiration = JSON.parse(base64.decode(file.uploads[0].fields.find(v => v.key === 'policy').value)).expiration
    return (now.isAfter(expiration))
  }

  static refreshUpload(id, path) {

    c_step_responses.updateOne({ _id: id }, { $set: ['content'] })
      .pathPrefix(`${path}/refresh`)
      .execute()
  }

  static getStepRespTypesWithFiles() {
    return objects.find({ name: 'c_step_response' })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('objectTypes.name', 'objectTypes.properties.name', 'objectTypes.properties.type', 'objectTypes.properties.properties.type', 'objectTypes.properties.properties.name')
      .passive()
      .next()
      .objectTypes
      .reduce((a, v) => {
        const prop = v.properties.find(p => p.type === 'File'),
              docProp = v.properties.find(p => p.type === 'Document')
        if (prop) {
          a.push({ objType: v.name, propName: prop.name })
        }

        // Active tasks have a c_value prop that is a doc prop containing a file
        // Marking these as complex
        if (docProp) {
          const dPFile = docProp.properties.find(p => p.type === 'File')
          if (dPFile) {
            a.push({ objType: v.name, propName: `${docProp.name}` })
          }

        }
        return a
      }, [])
  }

  static getStudyPinnedVersion() {
    return org.objects.c_study
      .find()
      .paths('c_pinned_version')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()[0]
      .c_pinned_version
  }

  static setSequenceNumber(taskResponse) {
    let publicUserId
    if (taskResponse.c_public_user) {
      publicUserId = taskResponse.c_public_user
    } else {
      const [publicUser] = org.objects.c_public_user
        .find({ c_account: taskResponse.c_account })
        .paths('_id')
        .skipAcl()
        .grant('read')
        .toArray()
      publicUserId = publicUser._id
    }

    const currentTaskResponsesCount = org.objects.c_task_response
      .find({ c_public_user: publicUserId, c_task: taskResponse.c_task })
      .skipAcl()
      .grant('read')
      .count() + 1
    taskResponse.c_sequence_number = `${currentTaskResponsesCount}`
  }

}