import request from 'request'
import { paths, id } from 'util'
import _ from 'underscore'
import logger from 'logger'
import { StepResponse } from 'c_dmweb_lib'
import { QueryStatus } from 'c_nucleus_query'
import faults from 'c_fault_lib'
import nucUtils from 'c_nucleus_utils'
import { transformKeysInStepObject, insertVariableTextChoices } from 'c_axon_utils_lib'
const config = require('config')

const { query: { closedQueries, limit = 1000, skip = 0 }, params: { taskResponseId } } = request

if (taskResponseId && !id.isIdFormat(taskResponseId)) {
  faults.throw('axon.invalidArgument.invalidObjectId')
}

const arrayOfResponses = org.objects.c_task_response.find({ _id: taskResponseId })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .toArray()

if (arrayOfResponses.length === 0) {
  faults.throw('axon.notFound.instanceNotFound')
}

const c_site = paths.to(arrayOfResponses, '0.c_site') || {}

const defaultQueryStatus = [QueryStatus.Open, QueryStatus.Responded]

const allowedTypeNames = StepResponse.getReadableTypesForUser(script.principal._id, c_site._id)

// eslint-disable-next-line eqeqeq
const queryStatus = closedQueries == 'true' ? defaultQueryStatus.concat([QueryStatus.Closed, QueryStatus.ClosedRequery]) : defaultQueryStatus

const {
  exclude_hidden_steps: excludeHiddenSteps,
  exclude_instruction_steps: excludeInstructionSteps
} = config.get('smweb__config') || { exclude_hidden_steps: true, exclude_instruction_steps: true }

const stepsPipeline = [
  { $match: { _id: c_site._id } },
  {
    $project: {
      c_task_responses: {
        $expand: {
          limit: 1000,
          pipeline: [
            { $match: { _id: taskResponseId } },
            {
              $project: {
                c_task: {
                  $expand: {
                    c_steps: {
                      $expand: {
                        limit,
                        skip,
                        pipeline: [
                          {
                            $match: {
                              c_type: {
                                $in: [
                                  'boolean',
                                  'text',
                                  'completion',
                                  'text_choice',
                                  'consent_review',
                                  'initials',
                                  'nucleus_question_review',
                                  'instruction',
                                  'form',
                                  'numeric',
                                  'autocomplete_text',
                                  'value_picker',
                                  'datetime',
                                  'time_of_day',
                                  'text_scale',
                                  'image_choice',
                                  'barcode_scanner',
                                  'continuous_scale',
                                  'email',
                                  'image_capture',
                                  'integer_scale',
                                  'location',
                                  'time_interval',
                                  'web_view',
                                  'webview_form'
                                ]
                              }
                            }
                          },
                          {
                            $sort: { c_order: 1 }
                          }
                        ]
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    }
  }]

let stepCursor
const availableRoleIds = nucUtils.getUserRolesSimple(script.principal._id, c_site._id)
if (nucUtils.isNewSiteUser(availableRoleIds)) {
  stepCursor = org.objects.accounts.aggregate(stepsPipeline)
    .pathPrefix(`${script.principal._id}/c_sites`)
} else {
  stepCursor = org.objects.c_site.aggregate(stepsPipeline)
}

const stepsPage = paths.to(stepCursor.toArray(), '0.c_task_responses.data.0.c_task.c_steps') || { object: 'list', data: [], hasMore: false }

const stepResponseMatch = (steps, allowedTypes) => {
  let $match = {
    c_step: {
      $in: steps.data
        .map(s => s._id)
    }
  }
  if (!_.isEmpty(allowedTypes)) {
    $match = { $and: [$match, { type: { $in: allowedTypes } }] }
  }
  return { $match }
}

const stepProjection = {
  $project: {
    c_skipped: 1,
    c_value: 1,
    type: 1,
    c_step: 1,
    c_study: 1,
    c_queries: {
      $expand: {
        limit: 1000,
        pipeline: [
          {
            $match: {
              c_status: { $in: queryStatus }
            }
          },
          {
            $project: {
              c_number: 1,
              c_status: 1,
              c_description: 1,
              c_response: 1,
              c_responded_by: {
                $expand: {
                  c_public_identifier: 1
                }
              },
              c_responded_datetime: 1,
              created: 1,
              c_closing_reason: 1,
              c_closed_datetime: 1,
              c_closed_by: {
                $expand: {
                  c_public_identifier: 1
                }
              },
              creator: {
                $expand: {
                  c_public_identifier: 1
                }
              }
            }
          }]
      }
    }
  }
}

// if it can read consent reviews then check if it can also read the file for that type
if (allowedTypeNames.includes('c_consent_review')) {
  const canReadConsentReviewFile = StepResponse.canReadStepTypeProp(script.principal._id, c_site._id, 'c_consent_review', 'c_file')

  if (canReadConsentReviewFile) {
    stepProjection.$project = { ...stepProjection.$project, c_file: 1 }
  }
}

const stepResponsesPipeline = [
  { $match: { _id: c_site._id } },
  {
    $project: {
      c_task_responses: {
        $expand: {
          limit: 1000,
          pipeline: [
            { $match: { _id: taskResponseId } },
            {
              $project: {
                c_step_responses: {
                  $expand: {
                    limit: 1000,
                    pipeline: [
                      stepResponseMatch(stepsPage, allowedTypeNames),
                      stepProjection
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    }
  }]

let stepResponsesCursor
if (nucUtils.isNewSiteUser(availableRoleIds)) {
  stepResponsesCursor = org.objects.accounts.aggregate(stepResponsesPipeline)
    .pathPrefix(`${script.principal._id}/c_sites`)
} else {
  stepResponsesCursor = org.objects.c_site.aggregate(stepResponsesPipeline)
}

const taskResponse = paths.to(stepResponsesCursor.toArray(), '0.c_task_responses.data.0') || {}

const createStepWrapper = (step, response) => {
  return ({
    c_step: step,
    c_step_response: response
  })
}

const stepResponses = paths.to(taskResponse, 'c_step_responses.data') || []

const taskVariables = (arrayOfResponses[0] && arrayOfResponses[0].c_metadata && arrayOfResponses[0].c_metadata.variables) || {}
const taskVariableNames = Object.keys(taskVariables)

const updatedData = stepsPage.data
  .reduce((steps, step) => {
    if (excludeHiddenSteps && step.c_hidden) {
      return steps
    }

    if (step.c_type === 'instruction' && excludeInstructionSteps) {
      return steps
    }

    const isStepResponseNeeded = !['instruction', 'completion'].includes(step.c_type)
    const stepResponseFound = id.findIdInArray(stepResponses, 'c_step._id', step._id)
    const response = isStepResponseNeeded && stepResponseFound ? stepResponseFound : null

    if (taskVariableNames.length) {
      step = transformKeysInStepObject(step, taskVariableNames, taskVariables)
      if (response) {
        step = insertVariableTextChoices(step, response, taskVariables)
      }
    }

    if (response) {
      const locks = org.objects.c_locks
        .find({ c_locked_object_id: response._id })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .toArray()

      response.c_locks = { data: locks }
    }

    steps.push(createStepWrapper(step, response))
    return steps
  }, [])

// this is to maintain the cursor
stepsPage.data = updatedData

return stepsPage