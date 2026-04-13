/***********************************************************

@script     Axon - List Site Participant Responses

@brief      List all participant responses for a site with filtering and pagination

@route      /c_sites/:siteId/c_all_participant_responses

@parameter siteId The site ID. The calling user must have read access to this site.

@query where Optional JSON string with filters: activity_name, activity_type, completion_date, created_date, participant_id, participant_number
@query sort Optional JSON string with sort: completion_date, created_date, activity_name
@query limit Optional number for pagination (default: 20)
@query skip Optional number for pagination offset (default: 0)

@returns A list of participant responses with activity details and step responses

@version    1.0.0

***********************************************************/

/**
 * FILTERING & SORTING OPTIONS
 *
 * SUPPORTED FILTERS (via 'where' query parameter as JSON string):
 * • activity_name      - Filter by activity/task name (partial match, case-insensitive)
 * • activity_type      - Filter by activity/observation type (exact match)
 * • completion_date    - Filter by completion date (c_end) (supports date operators like $gte, $lte)
 * • created_date       - Filter by creation date (supports date operators like $gte, $lte)
 * • participant_id     - Filter by participant ID (exact match)
 * • participant_number - Filter by participant number (exact match, e.g., "DS1-009")
 *
 * SUPPORTED SORTING (via 'sort' query parameter as JSON string):
 * • completion_date    - Sort by completion date (1 for ascending, -1 for descending)
 * • created_date       - Sort by creation date (1 for ascending, -1 for descending)
 * • activity_name      - Sort by activity name (1 for ascending, -1 for descending)
 *
 * PAGINATION:
 * • limit              - Number of results per page (default: 20)
 * • skip               - Number of results to skip for pagination (default: 0)
 *
 * EXAMPLES:
 *
 * Basic filtering:
 * ?where={"participant_number":"DS1-009"}
 * ?where={"activity_name":"Survey","activity_type":"questionnaire"}
 *
 * Date range filtering:
 * ?where={"completion_date":{"$gte":"2024-01-01","$lte":"2024-12-31"}}
 *
 * Sorting:
 * ?sort={"completion_date":-1}
 * ?sort={"activity_name":1,"completion_date":-1}
 *
 * Combined filtering, sorting & pagination:
 * ?where={"activity_type":"questionnaire"}&sort={"completion_date":-1}&limit=50&skip=100
 */

import req from 'request'
import { isIdFormat } from 'util.id'
import faults from 'c_fault_lib'

const { siteId } = req.params
let { where, sort, limit, skip } = req.query

// Default pagination
limit = limit ? parseInt(limit) : 20
skip = skip ? parseInt(skip) : 0

// Parse JSON filters
if (where) {
  where = JSON.parse(where)
} else {
  where = {}
}

if (sort) {
  sort = JSON.parse(sort)
} else {
  sort = { completion_date: -1 }
}

if (!isIdFormat(siteId)) {
  faults.throw('axon.invalidArgument.validSiteRequired')
}

// HANDLE COMPLEX FILTERS
let taskIds = null

if (where.activity_name || where.activity_type) {
  const site = org.objects.c_sites.find({ _id: siteId })
    .paths(['c_study'])
    .skipAcl()
    .grant('read')
    .next()

  if (!site || !site.c_study) {
    return {
      object: 'list',
      data: [],
      hasMore: false,
      pagination: { total_count: 0, page_size: limit, current_page: 1, total_pages: 0 }
    }
  }

  const studyId = site.c_study._id || site.c_study
  const studyTasks = org.objects.c_tasks.find()
    .where({ c_study: studyId })
    .paths(['_id', 'c_name', 'c_observation_type'])
    .skipAcl()
    .grant('read')
    .toArray()

  let matchingTasks = studyTasks

  if (where.activity_name) {
    const nameRegex = new RegExp(where.activity_name, 'i')
    matchingTasks = matchingTasks.filter(task =>
      nameRegex.test(task.c_name)
    )
  }

  if (where.activity_type) {
    matchingTasks = matchingTasks.filter(task =>
      task.c_observation_type === where.activity_type
    )
  }

  if (matchingTasks.length === 0) {
    return {
      object: 'list',
      data: [],
      hasMore: false,
      pagination: { total_count: 0, page_size: limit, current_page: 1, total_pages: 0 }
    }
  }

  taskIds = matchingTasks.map(t => t._id)
}

// BUILD TRANSFORMED WHERE CLAUSE
const transformedWhere = {}

if (taskIds) {
  transformedWhere.c_task = { $in: taskIds }
}

if (where.completion_date) {
  transformedWhere.c_end = where.completion_date
}

if (where.created_date) {
  transformedWhere.created = where.created_date
}

if (where.participant_id) {
  transformedWhere.c_public_user = where.participant_id
}

if (where.participant_number) {
  const participant = org.objects.c_public_user.find()
    .where({ c_number: where.participant_number })
    .paths(['_id'])
    .skipAcl()
    .grant('read')
    .next()

  if (participant) {
    transformedWhere.c_public_user = participant._id
  } else {
    return {
      object: 'list',
      data: [],
      hasMore: false,
      pagination: { total_count: 0, page_size: limit, current_page: 1, total_pages: 0 }
    }
  }
}

// TRANSFORM SORT CLAUSE
const transformedSort = {}
if (sort.completion_date) {
  transformedSort.c_end = sort.completion_date
}
if (sort.created_date) {
  transformedSort.created = sort.created_date
}

// MAIN QUERY
let taskResponseCursor = org.objects.c_task_responses.find()
  .where({
    c_site: siteId,
    ...transformedWhere
  })
  .paths([
    '_id',
    'c_task.c_name',
    'c_task.c_key',
    'c_task.c_observation_type',
    'c_task.c_data_labels',
    'c_completed',
    'c_end',
    'c_locale',
    'c_number',
    'c_public_user._id',
    'c_public_user.c_number',
    'c_visit',
    'c_group',
    'c_step_responses._id',
    'c_step_responses.c_value',
    'c_step_responses.c_step.c_name',
    'c_step_responses.c_step._id',
    'c_step_responses.type',
    'created'
  ])
  .expand(['c_task', 'c_public_user', 'c_visit', 'c_group', 'c_step_responses.c_step'])
  .skipAcl()
  .grant('read')

if (Object.keys(transformedSort).length > 0) {
  taskResponseCursor = taskResponseCursor.sort(transformedSort)
}
if (skip) taskResponseCursor = taskResponseCursor.skip(skip)
if (limit) taskResponseCursor = taskResponseCursor.limit(limit)

const taskResponses = taskResponseCursor.toArray()

const enrichedData = taskResponses.map(tr => {
  // Determine schedule
  let schedule = null
  if (tr.c_visit && tr.c_visit.c_name) {
    schedule = tr.c_visit.c_name
  } else if (tr.c_group && tr.c_group.c_name && tr.c_group.c_name !== 'All') {
    schedule = tr.c_group.c_name
  }

  const stepResponses = ((tr.c_step_responses && tr.c_step_responses.data) || []).map(sr => ({
    id: sr._id,
    question: sr.c_step ? sr.c_step.c_name : null,
    value: sr.c_value,
    type: sr.type,
    completed: tr.c_completed
  }))

  return {
    activity_id: tr.c_task ? tr.c_task.c_key : null,
    activity_name: tr.c_task ? tr.c_task.c_name : null,
    activity_type: tr.c_task ? tr.c_task.c_observation_type : null,
    completion_date: tr.c_end || tr.created,
    created_date: tr.created,
    is_clinician_interview: !!(tr.c_task && tr.c_task.c_data_labels && tr.c_task.c_data_labels.metadata && tr.c_task.c_data_labels.metadata.is_clinician_interview),
    response_locale: tr.c_locale,
    participant_id: tr.c_public_user ? tr.c_public_user._id : null,
    participant_number: tr.c_public_user ? tr.c_public_user.c_number : null,
    task_response_c_number: tr.c_number,
    schedule: schedule,
    step_responses: stepResponses,
    step_responses_count: ((tr.c_step_responses && tr.c_step_responses.data) || []).length,
    _id: tr._id
  }
})

// Get total count for pagination
const totalCount = org.objects.c_task_responses.find()
  .where({ c_site: siteId, ...transformedWhere })
  .skipAcl()
  .grant('read')
  .count()

const currentPage = Math.floor(skip / limit) + 1
const totalPages = Math.ceil(totalCount / limit)

return {
  object: 'list',
  data: enrichedData,
  hasMore: (skip + limit) < totalCount,
  pagination: {
    total_count: totalCount,
    page_size: limit,
    current_page: currentPage,
    total_pages: totalPages
  }
}