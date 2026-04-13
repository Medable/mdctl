/***********************************************************

@script     Axon - Creeate Task Response

@brief      Route to create the task response and child step
            responses. Checks for duplicate task responses
            and handles accordingly

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import request from 'request'
import response from 'response'
import { principals } from 'consts'
import _ from 'underscore'
import { SystemUser } from 'c_nucleus_utils'
import { genError } from 'c_axon_script_lib'
import logger from 'logger'
import base64 from 'base64'
import moment from 'moment'

/* eslint-disable camelcase, one-var */

const { c_task_responses, c_step_responses, c_sites, objects, c_public_users, accounts } = org.objects,
      // create response util for use later
      createResponse = () => {
        // copy the input object so we can mess with it
        let trCreate = Object.assign({}, c_task_response),
            c_completed = c_task_response.c_completed

        if (script.locale) {
          trCreate.c_locale = script.locale
        } else {
          trCreate.c_locale = 'en_US'
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
                trCreate.c_tz = user[property]
              }
            }
          }
        }

        // remove the step responses from the input and create the task Response
        delete trCreate.c_step_responses
        // in order to trigger the Query update on completetion we will set the c_completed value at the end
        if (c_completed) {
          delete trCreate.c_completed
        }

        let tr = c_task_responses.insertOne(trCreate)
              .lean(false)
              .execute(),
            // Update the step responses with the new task response ID and create those too
            stepResponses = c_task_response.c_step_responses.map(v => {
              v.c_task_response = tr._id
              return v
            })
        c_step_responses.insertMany(stepResponses)
          .execute()

        if (c_completed) {
          c_task_responses.updateOne({ _id: tr._id }, { $set: { c_completed } })
            .execute()
        }

        return tr

      },
      // decode the file upload policy to determine the expiry
      uploadExpired = (file) => {
        const now = moment(),
              expiration = JSON.parse(base64.decode(file.uploads[0].fields.find(v => v.key === 'policy').value)).expiration
        return (now.isAfter(expiration))
      },
      refreshUpload = (id, path) => {
        c_step_responses.updateOne({ _id: id }, { $set: ['content'] })
          .pathPrefix(`${path}/refresh`)
          .execute()
      }

let { c_task_response, c_site } = request.body,
    responseCreator,
    c_uuid = c_task_response.c_uuid,
    principalId = script.principal._id

// validate  parameters
if (!c_task_response) genError('You must provide a task response', 400)
if (!c_task_response.c_study) genError('You must provide a valid c_study parameter in the task response body', 400)

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

try {
  // The owner of the response will change (if created in the site-app). This means that creator will no longer have direct read access after creation.
  // In order not to cause an error so we need our grant at a higher level using script.as whether it's an anonymous call or not.
  if (principalId.equals(principals.anonymous)) {
    principalId = SystemUser.name
  }
  let taskResponse = script.as(principalId, { principal: { skipAcl: true, grant: consts.accessLevels.script }, acl: { safe: false }, modules: { safe: false } }, createResponse)

  // if no uuid was provided set uuid to the newly generated one for querying later
  if (!c_uuid) {
    c_uuid = taskResponse.c_uuid
  }

  responseCreator = taskResponse.creator._id
} catch (e) {
  // if fault isn't because of duplicate uuids, return it
  if (!(e.faults && e.faults[0].code === 'kDuplicateKey' && e.faults[0].path === 'c_uuid')) {
    return e
  } else {
    logger.info('Duplicate')
  }
}
// get the step response object types that contain files
let stepResponseTypeFiles = objects.find({ name: 'c_step_response' })
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

// get the response owner if we don't hyave it already
if (!responseCreator) {
  responseCreator = c_task_responses.find({ c_uuid })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .paths('creator')
    .next().creator._id
}

// return task response with step responses. User the response owner to ensure file upload information
return script.as(responseCreator, { principal: { grant: consts.accessLevels.script, skipAcl: true }, modules: { safe: false } }, () => {
  let response = c_task_responses.find({ c_uuid })
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
    let ot = stepResponseTypeFiles.find(srt => srt.objType === v.type)
    if (ot && v[ot.propName]) {
      let returning = false,
          refreshing = false

      // active task types require specific attention
      if (ot.objType === 'c_active_task') {

        let c_value = v[ot.propName]
        c_value.forEach(val => {
          val.c_file.forEach(file => {
            if (file.state === consts.media.states.pending) {
              returning = true

              if (uploadExpired(file)) {
                refreshing = true
                refreshUpload(v._id, `c_value.${val._id}.c_file.${file._id}`)
              }

            } else if (file.state === consts.media.states.error || file.state === consts.media.states.dead) {
              refreshing = true
              refreshUpload(v._id, `c_value.${val._id}.c_file.${file._id}`)
            }
          })
        })
      } else {
        if (v[ot.propName].state === consts.media.states.pending) {
          returning = true
          if (uploadExpired(v[ot.propName])) {
            refreshing = true
            refreshUpload(v._id, ot.propName)
          }
        } else if (v[ot.propName].state === consts.media.states.error || v[ot.propName].state === consts.media.states.dead) {
          // refresh the file upload info
          refreshing = true
          refreshUpload(v._id, ot.propName)
        }
      }

      if (returning && !refreshing) {
        a.push(_.pick(v, '_id', 'object', 'type', ot.propName))
      } else if (refreshing) {
        let step = c_step_responses.find({ _id: v._id })
          .next()
        a.push(_.pick(step, '_id', 'object', 'type', ot.propName))
      }
    }
    return a
  }, [])
  return response
})