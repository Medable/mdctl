import _ from 'underscore'
import { StepResponse } from 'c_dmweb_lib'
import { paths, id } from 'util'
import request from 'request'
import logger from 'logger'
import faults from 'c_fault_lib'
import nucUtils from 'c_nucleus_utils'
import { transformKeysInStepObject, insertVariableTextChoices } from 'c_axon_utils_lib'

function getTaskResponseIds(siteId, taskResponseId, allowedTypeNames, principalId) {
  const stepResponsePipeline = _.compact([
    (allowedTypeNames.length && { $match: { type: { $in: allowedTypeNames } } }),
    {
      $project: {
        _id: 1,
        c_queries: {
          $expand: {
            limit: 1000,
            pipeline: [{
              $project: {
                _id: 1
              }
            }]
          }
        }
      }
    }])
  const availableRoleIds = nucUtils.getUserRolesSimple(principalId, siteId)
  if (!nucUtils.isNewSiteUser(availableRoleIds)) {
    return org.objects.c_site
      .aggregate([
        {
          $project: {
            _id: 1,
            c_reviews: {
              $expand: {
                limit: 1000,
                pipeline: [{ $project: { _id: 1 } }]
              }
            },
            c_step_responses: {
              $expand: {
                limit: 1000,
                pipeline: stepResponsePipeline
              }
            },
            c_queries: {
              $expand: {
                limit: 1000,
                pipeline: [
                  { $match: { c_step_response: undefined } },
                  { $project: { _id: 1 } }
                ]
              }
            }
          }
        }
      ])
      .pathPrefix(`${siteId}/c_task_responses/${taskResponseId}`)
      .toArray()
  } else {
    return org.objects.accounts
      .aggregate([
        {
          $project: {
            _id: 1,
            c_reviews: {
              $expand: {
                limit: 1000,
                pipeline: [{ $project: { _id: 1 } }]
              }
            },
            c_step_responses: {
              $expand: {
                limit: 1000,
                pipeline: stepResponsePipeline
              }
            },
            c_queries: {
              $expand: {
                limit: 1000,
                pipeline: [
                  { $match: { c_step_response: undefined } },
                  { $project: { _id: 1 } }
                ]
              }
            }
          }
        }
      ])
      .pathPrefix(`${script.principal._id}/c_sites/${siteId}/c_task_responses/${taskResponseId}`)
      .toArray()
  }
}

function getStepResponseIds(siteId, taskResponseId, stepResponseId, allowedTypeNames, principalId) {
  const conditions = _.compact([(allowedTypeNames.length && { type: { $in: allowedTypeNames } }), { _id: stepResponseId }])
  const stepResponseMatch = conditions.length > 1 ? { $match: { $and: conditions } } : { $match: conditions[0] }
  const availableRoleIds = nucUtils.getUserRolesSimple(principalId, siteId)
  if (!nucUtils.isNewSiteUser(availableRoleIds)) {
    return org.objects.c_site.aggregate([
      stepResponseMatch,
      {
        $project: {
          _id: 1,
          c_queries: {
            $expand: {
              limit: 1000,
              pipeline: [{
                $project: {
                  _id: 1
                }
              }]
            }
          }
        }
      }])
      .pathPrefix(`${siteId}/c_task_responses/${taskResponseId}/c_step_responses`)
      .toArray()
  } else {
    return org.objects.accounts.aggregate([
      stepResponseMatch,
      {
        $project: {
          _id: 1,
          c_queries: {
            $expand: {
              limit: 1000,
              pipeline: [{
                $project: {
                  _id: 1
                }
              }]
            }
          }
        }
      }])
      .pathPrefix(`${script.principal._id}/c_sites/${siteId}/c_task_responses/${taskResponseId}/c_step_responses`)
      .toArray()
  }
}

function getPublicUserIds(siteId, publicUserId, principalId) {
  const availableRoleIds = nucUtils.getUserRolesSimple(principalId, siteId)
  let queryIds
  if (!nucUtils.isNewSiteUser(availableRoleIds)) {
    queryIds = org.objects.c_sites
      .aggregate([
        {
          $match: { c_task_response: { $exists: false }, c_subject: publicUserId }
        },
        {
          $project: {
            _id: 1
          }
        }
      ])
      .pathPrefix(`${siteId}/c_queries`)
      .toArray()
  } else {
    queryIds = org.objects.accounts
      .aggregate([
        {
          $match: { c_task_response: { $exists: false }, c_subject: publicUserId }
        },
        {
          $project: {
            _id: 1
          }
        }
      ])
      .pathPrefix(`${script.principal._id}/c_sites/${siteId}/c_queries`)
      .toArray()
  }
  return [{ _id: publicUserId }, ...queryIds]
}

function getSiteId(object, objectId) {
  const arrayOfResponses = org.objects[object].find({ _id: objectId })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .paths('c_site')
    .toArray()
  const c_site = paths.to(arrayOfResponses, '0.c_site') || {}
  return c_site._id
}

function keyReducer(key, payload) {
  let localAcum = []
  for (const k in payload) {
    const object = payload[k]
    if (k === key) {
      localAcum.push(object)
    } else if (_.isObject(object)) {
      localAcum = localAcum.concat(keyReducer(key, object))
    }
  }
  return localAcum
}

function getContextIds(object, objectId) {
  const siteId = getSiteId(object, objectId)
  if (!siteId) {
    return []
  }
  const allowedTypeNames = StepResponse.getReadableTypesForUser(script.principal._id, siteId)
  let contextIds = []
  if (object === 'c_task_response') {
    contextIds = keyReducer('_id', getTaskResponseIds(siteId, objectId, allowedTypeNames, script.principal._id))
  } else if (object === 'c_step_response') {
    const [stepResponse] = org.objects.c_step_response.find({ _id: objectId })
      .paths('c_task_response')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()
    const taskResponseId = paths.to(stepResponse, 'c_task_response._id')
    contextIds = keyReducer('_id', getStepResponseIds(siteId, taskResponseId, objectId, allowedTypeNames, script.principal._id))
  } else if (object === 'c_public_user') {
    contextIds = keyReducer('_id', getPublicUserIds(siteId, objectId, script.principal._id))
  }

  return contextIds
    // we don't want to have site id history
    .filter(id => !siteId.equals(id))
}

const { params: { object, objectId } } = request

const allowedObjects = ['c_task_response', 'c_step_response', 'c_public_user']

if (!allowedObjects.includes(object)) {
  faults.throw('axon.unsupportedOperation.notImplemented')
}

if (!objectId || !id.isIdFormat(objectId)) {
  faults.throw('axon.invalidArgument.invalidObjectId')
}

const isFound = org.objects[object].find({ _id: objectId })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .hasNext()

if (!isFound) {
  faults.throw('axon.notFound.instanceNotFound')
}
const contextIds = getContextIds(object, objectId)
if (!contextIds.length) return []
const data = org.objects.history
  .aggregate([
    {
      $match: {
        'context._id': { $in: contextIds }
      }
    },
    { $sort: { _id: -1 } }
  ])
  .skipAcl()
  .grant(8)
  .transform('c_audits_transform')

if (object === 'c_step_response') {
  const [stepResponse] = org.objects.c_step_response.find({ _id: objectId }).expand('c_task_response')
    .skipAcl()
    .grant(8)
    .toArray()
  const metadataVariables = (stepResponse.c_task_response.c_metadata && stepResponse.c_task_response.c_metadata.variables) || {}
  if (Object.keys(metadataVariables).length) {
    return data.map(obj => {
      if (obj.document.c_step) {
        obj.document.c_step = transformKeysInStepObject(obj.document.c_step, Object.keys(metadataVariables), metadataVariables)
        obj.document.c_step = insertVariableTextChoices(obj.document.c_step, stepResponse, metadataVariables)
      }
      return obj
    })
  }
}

return data