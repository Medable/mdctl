/*
 * PI Oversight shared library: due/overdue computation and review bundle building.
 */

import { listParticipantResponses } from 'c_site_participant_responses_lib'
import logger from 'logger'

const { c_studies, c_public_users, c_events } = org.objects

// PI Oversight Status Enum
const PI_OVERSIGHT_STATUS = {
  OVERDUE: 'Overdue',
  REVIEW_REQUIRED: 'Review required',
  CURRENT: 'Current'
}

// Days before review window ends when status becomes 'Review required'
const REVIEW_LEAD_TIME_DAYS = 2

// Max entries to scan after a DCR change to find the previous c_value (history is newest-first).
const HISTORY_SCAN_LIMIT = 15

/**
 * Get and validate PI Oversight configuration for a study
 * Ensures all values are valid integers >= 1, with proper defaults
 * @param {ObjectId} studyId - Study ID
 * @returns {Object} Validated configuration: { reviewDueWeeks, overdueGraceDays, emailIntervalWeeks }
 */
function getValidatedStudyConfig(studyId) {
  // Default values
  const defaults = {
    reviewDueWeeks: 1,
    overdueGraceDays: 2,
    emailIntervalWeeks: 1
  }

  // Fetch study configuration
  const study = c_studies.readOne({ _id: studyId })
    .paths('c_pi_oversight_review_due_weeks', 'c_pi_oversight_overdue_grace_days', 'c_pi_oversight_email_interval_weeks')
    .skipAcl()
    .grant('read')
    .execute()

  if (!study) {
    return defaults
  }

  /**
   * Validate and parse a config value
   * - Must be a non-negative integer
   * - If null, undefined, NaN, or < 0, return default
   * - If not an integer, floor it
   */
  function validateConfigValue(value, defaultValue) {
    // Check if value is null, undefined, or NaN
    if (value == null || typeof value !== 'number' || isNaN(value)) {
      return defaultValue
    }

    // Floor to integer
    const intValue = Math.floor(value)

    // Ensure at least 0 (0 is valid for reviewDueWeeks meaning "never due")
    if (intValue < 0) {
      return defaultValue
    }

    return intValue
  }

  /**
   * Validate reviewDueWeeks - allows 0 (never due)
   * - Must be a non-negative integer
   * - If null, undefined, NaN, or < 0, return default
   */
  function validateReviewDueWeeks(value, defaultValue) {
    if (value == null || typeof value !== 'number' || isNaN(value)) {
      return defaultValue
    }

    const intValue = Math.floor(value)
    if (intValue < 0) {
      return defaultValue
    }

    return intValue
  }

  return {
    reviewDueWeeks: validateReviewDueWeeks(study.c_pi_oversight_review_due_weeks, defaults.reviewDueWeeks),
    overdueGraceDays: validateConfigValue(study.c_pi_oversight_overdue_grace_days, defaults.overdueGraceDays),
    emailIntervalWeeks: validateConfigValue(study.c_pi_oversight_email_interval_weeks, defaults.emailIntervalWeeks)
  }
}

/**
 * Calculate oversight status for a single participant
 * Uses the same logic as computeDueParticipants
 * @param {Object} params
 * @param {ObjectId} params.participantId - Participant ID
 * @param {ObjectId} params.siteId - Site ID
 * @param {ObjectId} params.studyId - Study ID
 * @returns {String} Status: PI_OVERSIGHT_STATUS.OVERDUE | PI_OVERSIGHT_STATUS.REVIEW_REQUIRED | PI_OVERSIGHT_STATUS.CURRENT
 */
function calculateParticipantStatus({ participantId, siteId, studyId }) {
  // Get validated configuration (same as computeDueParticipants)
  const config = getValidatedStudyConfig(studyId)

  if (config.reviewDueWeeks === 0) {
    return PI_OVERSIGHT_STATUS.CURRENT
  }

  const windowDays = config.reviewDueWeeks * 7
  const dueDays = Math.max(0, windowDays - REVIEW_LEAD_TIME_DAYS) // Due (Review required) 2 days before window ends
  const overdueDays = windowDays + config.overdueGraceDays // Overdue after window ends + grace days

  // Get participant created date
  const participant = c_public_users
    .readOne({ _id: participantId })
    .paths('created')
    .skipAcl()
    .grant('read')
    .execute()

  if (!participant) {
    return PI_OVERSIGHT_STATUS.CURRENT // Fail-safe default
  }

  const participantCreated = participant.created

  // Find last signoff for this participant/site/study (same as get_review_bundle route)
  const lastSignArr = org.objects.c_pi_oversight_signoff
    .find({ c_public_user: participantId, c_site: siteId, c_study: studyId })
    .paths('c_signed_at_utc')
    .sort({ c_signed_at_utc: -1 })
    .skipAcl()
    .grant('read')
    .limit(1)
    .toArray()
  const lastSignedAtUtc = (lastSignArr && lastSignArr.length && lastSignArr[0].c_signed_at_utc) || null

  const effectiveDate = lastSignedAtUtc || participantCreated
  const nowUtc = new Date()

  // Check if there are new responses since last sign-off
  // Same logic as in computeDueParticipants: isNewResponse check
  const newResponseCount = org.objects.c_task_response
    .find({
      c_public_user: participantId,
      c_site: siteId,
      c_study: studyId,
      $or: [
        { c_end: { $gt: effectiveDate } },
        {
          c_end: null,
          c_start: { $gt: effectiveDate }
        },
        {
          c_end: null,
          c_start: null,
          created: { $gt: effectiveDate }
        }
      ]
    })
    .skipAcl()
    .grant('read')
    .count()

  // If no new responses, status is Current (same as computeDueParticipants)
  if (newResponseCount === 0) {
    return PI_OVERSIGHT_STATUS.CURRENT
  }

  // Calculate due dates (same as computeDueParticipants)
  const dueAt = new Date(effectiveDate.getTime())
  dueAt.setDate(dueAt.getDate() + dueDays)

  const overdueAt = new Date(effectiveDate.getTime())
  overdueAt.setDate(overdueAt.getDate() + overdueDays)

  // Determine status (same logic as computeDueParticipants)
  if (nowUtc >= overdueAt) {
    return PI_OVERSIGHT_STATUS.OVERDUE
  } else if (nowUtc >= dueAt) {
    return PI_OVERSIGHT_STATUS.REVIEW_REQUIRED
  } else {
    return PI_OVERSIGHT_STATUS.CURRENT
  }
}

/**
 * Compute due participants grouped by status with pagination
 * nb: This calculation is only based on task responses, and does not include visit events or updated data.
 * Returns data grouped by status (Overdue, Review required, Current)
 * @param {Object} params
 * @param {ObjectId} params.siteId - Site ID
 * @param {ObjectId} params.studyId - Study ID
 * @param {Number} params.limit - Number of participants per status group (default: 20)
 * @param {Number} params.skip - Offset for pagination per status group (default: 0)
 * @param {String} params.status - Filter by status: 'Overdue', 'Review required', 'Current', or null for all
 * @param {String} params.participantId - Filter by participant ID (exact match)
 * @returns {Array} Array of status groups with { status, totalCount, participants, hasMore }
 */
function computeDueParticipants({ siteId, studyId, limit = 20, skip = 0, status, participantId, participantNumber }) {
  // Get validated configuration
  const config = getValidatedStudyConfig(studyId)

  const windowDays = config.reviewDueWeeks * 7
  const dueDays = Math.max(0, windowDays - REVIEW_LEAD_TIME_DAYS) // Due (Review required) 2 days before window ends
  const overdueDays = windowDays + config.overdueGraceDays // Overdue after window ends + grace days
  const shouldIncludeDueOrOverdueDates = windowDays > 0

  const nowUtc = new Date()

  // Build initial match criteria for task responses
  const taskResponseMatch = {
    c_site: siteId,
    c_study: studyId
  }
  if (participantId) {
    taskResponseMatch['c_public_user._id'] = participantId
  }

  // Start from c_task_responses and expand to get participant info with last sign-off
  const result = org.objects.c_task_response
    .aggregate([
      { $match: taskResponseMatch },
      {
        $project: {
          _id: 1,
          created: 1,
          c_start: 1,
          c_end: 1,
          c_public_user: {
            $expand: {
              _id: 1,
              c_number: 1,
              created: 1,
              c_last_pi_oversight_signoff: {
                $expand: {
                  c_signed_at_utc: 1
                }
              }
            }
          }
        }
      }
    ])
    .expressionPipeline([
      // Project participant data with response creation date and filter flag
      {
        $project: {
          participantId: '$$ROOT.c_public_user._id',
          participantNumber: '$$ROOT.c_public_user.c_number',
          participantCreated: '$$ROOT.c_public_user.created',
          lastSignedAtUtc: '$$ROOT.c_public_user.c_last_pi_oversight_signoff.c_signed_at_utc',
          responseAt: { $ifNull: ['$$ROOT.c_end', { $ifNull: ['$$ROOT.c_start', '$$ROOT.created'] }] },
          isNewResponse: {
            $gt: [
              { $ifNull: ['$$ROOT.c_end', { $ifNull: ['$$ROOT.c_start', '$$ROOT.created'] }] },
              { $ifNull: ['$$ROOT.c_public_user.c_last_pi_oversight_signoff.c_signed_at_utc', '$$ROOT.c_public_user.created'] }
            ]
          }
        }
      },
      // Group all responses into an array, then filter
      {
        $group: {
          _id: null,
          allResponses: { $push: '$$ROOT' }
        }
      },
      {
        $project: {
          filteredResponses: {
            $filter: {
              input: '$$ROOT.allResponses',
              as: 'resp',
              cond: { $eq: ['$$resp.isNewResponse', true] }
            }
          }
        }
      },
      {
        $unwind: '$filteredResponses'
      },
      // Group by participant to get unique participants with new responses
      {
        $group: {
          _id: '$filteredResponses.participantId',
          participantNumber: { $first: '$filteredResponses.participantNumber' },
          participantCreated: { $first: '$filteredResponses.participantCreated' },
          lastSignedAtUtc: { $first: '$filteredResponses.lastSignedAtUtc' },
          newResponseCount: { $sum: 1 }
        }
      },
      // Filter by participantNumber if provided (includes/contains match)
      {
        $group: {
          _id: null,
          allByParticipant: { $push: '$$ROOT' }
        }
      },
      {
        $project: {
          filtered: participantNumber
            ? {
              $filter: {
                input: '$$ROOT.allByParticipant',
                as: 'p',
                cond: {
                  $regexMatch: {
                    input: { $ifNull: ['$$p.participantNumber', ''] },
                    regex: participantNumber,
                    options: 'i'
                  }
                }
              }
            }
            : '$$ROOT.allByParticipant'
        }
      },
      {
        $unwind: '$filtered'
      },
      {
        $project: {
          _id: '$filtered._id',
          participantNumber: '$filtered.participantNumber',
          participantCreated: '$filtered.participantCreated',
          lastSignedAtUtc: '$filtered.lastSignedAtUtc',
          newResponseCount: '$filtered.newResponseCount'
        }
      },
      // Calculate status based on time since last sign-off (or creation)
      {
        $project: {
          participantId: '$$ROOT._id',
          participantNumber: '$$ROOT.participantNumber',
          lastSignedAtUtc: '$$ROOT.lastSignedAtUtc',
          ...(shouldIncludeDueOrOverdueDates
            ? {
              dueAt: {
                $moment: [
                  { $ifNull: ['$$ROOT.lastSignedAtUtc', '$$ROOT.participantCreated'] },
                  { add: [dueDays, 'd'] }
                ]
              },
              overdueAt: {
                $moment: [
                  { $ifNull: ['$$ROOT.lastSignedAtUtc', '$$ROOT.participantCreated'] },
                  { add: [overdueDays, 'd'] }
                ]
              }
            }
            : {
              dueAt: { $literal: null },
              overdueAt: { $literal: null }
            }),
          status: {
            $cond: [
              { $eq: [windowDays, 0] },
              PI_OVERSIGHT_STATUS.CURRENT,
              {
                $cond: [
                  {
                    $moment: [
                      nowUtc,
                      {
                        isSameOrAfter: {
                          $moment: [
                            { $ifNull: ['$$ROOT.lastSignedAtUtc', '$$ROOT.participantCreated'] },
                            { add: [overdueDays, 'd'] }
                          ]
                        }
                      }
                    ]
                  },
                  PI_OVERSIGHT_STATUS.OVERDUE,
                  {
                    $cond: [
                      {
                        $moment: [
                          nowUtc,
                          {
                            isSameOrAfter: {
                              $moment: [
                                { $ifNull: ['$$ROOT.lastSignedAtUtc', '$$ROOT.participantCreated'] },
                                { add: [dueDays, 'd'] }
                              ]
                            }
                          }
                        ]
                      },
                      PI_OVERSIGHT_STATUS.REVIEW_REQUIRED,
                      PI_OVERSIGHT_STATUS.CURRENT
                    ]
                  }
                ]
              }
            ]
          }
        }
      },
      // Group all participants, then filter by status if needed
      {
        $group: {
          _id: null,
          allParticipants: { $push: '$$ROOT' }
        }
      },
      {
        $project: {
          filtered: status
            ? {
              $filter: {
                input: '$$ROOT.allParticipants',
                as: 'p',
                cond: { $eq: ['$$p.status', status] }
              }
            }
            : '$$ROOT.allParticipants'
        }
      },
      {
        $project: {
          allParticipants: '$$ROOT.filtered',
          totalCount: { $size: '$$ROOT.filtered' }
        }
      },
      // Apply pagination using range + arrayElemAt to avoid $slice inconsistencies
      {
        $project: {
          items: '$$ROOT.allParticipants',
          totalCount: '$$ROOT.totalCount',
          endIndex: { $min: [{ $add: [skip, limit] }, '$$ROOT.totalCount'] }
        }
      },
      {
        $project: {
          data: {
            $map: {
              input: { $range: [skip, '$$ROOT.endIndex', 1] },
              as: 'i',
              in: { $arrayElemAt: ['$$ROOT.items', '$$i'] }
            }
          },
          totalCount: '$$ROOT.totalCount',
          hasMore: { $gt: ['$$ROOT.totalCount', { $add: [skip, limit] }] }
        }
      }
    ])
    .skipAcl()
    .grant(consts.accessLevels.read)
    .toArray()

  return result
}

function buildReviewBundle({ participantId, siteId, studyId, sinceUtc }) {
  const responses = listParticipantResponses({ participantId, siteId, studyId, sinceUtc })
  const visitEvents = listVisitEvents({ participantId, siteId, studyId, sinceUtc })
  return { responses, visitEvents }
}

/**
 * List visit events (started, skipped) for a participant within the oversight window
 * Note: Visits are either started or skipped. Once started, they remain active indefinitely.
 * Missed and ended states are not used for PI Oversight purposes.
 *
 * @param {Object} params
 * @param {ObjectId} params.participantId - Participant ID
 * @param {ObjectId} params.siteId - Site ID for validation
 * @param {ObjectId} params.studyId - Study ID for validation
 * @param {Date} params.sinceUtc - Only include events that occurred after this date
 * @returns {Array} Array of visit events with status 'started' or 'skipped'
 */
function listVisitEvents({ participantId, siteId, studyId, sinceUtc }) {
  const participant = c_public_users
    .readOne({ _id: participantId, c_site: siteId, c_study: studyId })
    .paths('_id')
    .skipAcl()
    .grant('read')
    .execute()

  if (!participant) {
    logger.error(`listVisitEvents: Participant ${participantId} not found for site ${siteId}, study ${studyId}`)
    return []
  }

  const match = {
    c_public_user: participantId,
    type: 'c_visit_event'
  }

  let windowStart
  if (sinceUtc) {
    windowStart = new Date(sinceUtc)
    match.created = { $gte: windowStart }
  }

  const events = c_events.find(match)
    .paths(
      'c_schedule_visit._id',
      'c_schedule_visit.c_name',
      'c_started',
      'c_skipped',
      'c_skipped_date',
      'c_skipped_reason'
    )
    .skipAcl()
    .grant('read')
    .sort({ created: -1 })
    .toArray()

  // no more available indexes on c_event, so we need to filter manually
  return events.reduce((acc, event) => {
    if (!windowStart || (event.c_started >= windowStart || event.c_skipped_date >= windowStart)) {
      acc.push({
        visitName: (event.c_schedule_visit && event.c_schedule_visit.c_name) || 'Unknown Visit',
        visitId: event.c_schedule_visit && event.c_schedule_visit._id ? event.c_schedule_visit._id.toString() : null,
        status: event.c_skipped ? 'skipped' : 'started',
        windowStart: event.c_started || null,
        skippedAt: event.c_skipped_date || null,
        skippedReason: event.c_skipped_reason || null
      })
    }
    return acc
  }, [])
}

/**
 * Internal helper to check if user has any of the required roles
 * @param {Array<string>} requiredRoles - Array of role IDs to check
 * @returns {boolean} True if user is admin or has any required role
 */
function _checkUserRoles(requiredRoles) {
  // Check for administrator (admins have access to everything)
  const isAdmin = script.principal.roleCodes && script.principal.roleCodes.includes('administrator')
  if (isAdmin) {
    return true
  }

  // Get user's roles
  const roles = (script.principal && script.principal.roles) || []

  // Filter out null/undefined role IDs
  const validRoles = requiredRoles.filter(Boolean)

  // Check if user has any of the required roles
  const hasRole = (roleId) => roles.find(r => r.toString() === roleId.toString())
  return validRoles.some(roleId => hasRole(roleId))
}

/**
 * Authorize Principal Investigator access
 * Checks if the current user has administrator or PI investigator role
 * IAM syncs roles to account.roles, so we can check directly
 */
function authorizePI() {
  const piRoles = [
    consts.roles['Axon Site Investigator']
  ]

  if (_checkUserRoles(piRoles)) {
    return true
  }

  // Access denied - not admin or PI
  logger.error('PI Oversight access denied: User must be an administrator or principal investigator')
  throw Object.assign(new Error('User must be an administrator or principal investigator'), { code: 'kAccessDenied', statusCode: 403 })
}

/**
 * Authorize Site User access
 * Checks if the current user has administrator or any site-level role
 * IAM syncs roles to account.roles, so we can check directly
 */
function authorizeSiteUser() {
  const siteRoles = [
    consts.roles['Axon Site Investigator'],
    consts.roles['Axon Site User'],
    consts.roles['Axon Site Monitor'],
    consts.roles['Axon Site Auditor']
  ]

  if (_checkUserRoles(siteRoles)) {
    return true
  }

  // Access denied - not admin or site user
  logger.error('Site access denied: User must be an administrator or have a site-level role')
  throw Object.assign(new Error('Access denied: User must have appropriate site-level permissions'), { code: 'kAccessDenied', statusCode: 403 })
}

function ensureEnabled(studyId) {
  const study = c_studies.readOne({ _id: studyId })
    .paths('c_pi_oversight_enabled')
    .skipAcl()
    .grant('read')
    .execute()
  if (!study || study.c_pi_oversight_enabled !== true) {
    logger.error(`PI Oversight access denied: Feature is not enabled for study ${studyId}`)
    throw Object.assign(new Error('PI Oversight is not enabled for this study'), { code: 'kAccessDenied', statusCode: 403 })
  }
}

function getOversightWindowStart(participantId, siteId, studyId) {
  const last = org.objects.c_pi_oversight_signoff
    .find({ c_public_user: participantId, c_site: siteId, c_study: studyId })
    .paths('c_signed_at_utc')
    .sort({ c_signed_at_utc: -1 })
    .skipAcl()
    .grant('read')
    .limit(1)
    .toArray()

  const lastSignedAtUtc = (last && last.length && last[0].c_signed_at_utc) || null
  if (lastSignedAtUtc) return lastSignedAtUtc

  const pu = c_public_users
    .readOne({ _id: participantId })
    .paths('created')
    .skipAcl()
    .grant('read')
    .execute()

  return pu && pu.created
}

/**
 * Recursively sorts object keys to produce canonical JSON
 * Used for deterministic hashing of review bundle data
 * @param {any} value - Value to canonicalize
 * @returns {any} Value with all object keys sorted alphabetically
 */
function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson)
  }
  if (value && typeof value === 'object') {
    const sorted = {}
    Object.keys(value).sort().forEach(key => {
      sorted[key] = canonicalizeJson(value[key])
    })
    return sorted
  }
  return value
}

/**
 * Parse DCR Number and reason from audit history message. This function is necessary because the audit history message is human-generated and can contain the DCR Number in slightly different ways.
 * @param {string} message - The audit history message
 * @returns {Object} Object with { dcrNumber: string, reason: string }
 */
function parseDCRMessage(message) {
  if (!message || typeof message !== 'string') {
    return { dcrNumber: '', reason: '' }
  }

  const dcrMatch = message.match(/(DCR-\d+)/i)
  if (!dcrMatch) {
    return { dcrNumber: '', reason: message }
  }

  const rawMatch = dcrMatch[1]
  let reason = message.replace(rawMatch, '').trim()

  // Remove leading colon if present
  reason = reason.replace(/^:\s*/, '').trim()

  // Collapse multiple spaces into a single space, like when DCR is in the middle for some reason.
  reason = reason.replace(/\s+/g, ' ')

  return { dcrNumber: rawMatch.toUpperCase(), reason }
}

/**
 * Get DCR items from Audit History
 *
 * @param {ObjectId} participantId - c_public_user _id
 * @param {ObjectId} siteId - c_site _id
 * @param {Date} lastSignedAt - Date to filter DCRs after
 * @return {Array} Array of DCR items
 */
function getDCRItems(participantId, siteId, lastSignedAt) {
  try {
    const query = {
      c_public_user: participantId,
      c_site: siteId
    }

    // no filtering on updated date b/c updated isn't indexed
    const stepResponses = org.objects.c_step_response
      .find(query)
      .include('audit.history')
      .expand('c_step', 'c_task')
      .paths(
        '_id',
        'type',
        'c_value',
        'c_step._id',
        'c_step.c_name',
        'c_step.c_question',
        'c_step.c_text',
        'c_step.c_text_choices',
        'c_step.c_type',
        'c_task._id',
        'c_task.c_name',
        'audit.history'
      )
      .skipAcl()
      .limit(1000)
      .sort({ created: -1 })
      .grant('read')
      .toArray()

    const dcrItems = []

    stepResponses.forEach(stepResponse => {
      const historyData = stepResponse.audit && stepResponse.audit.history && stepResponse.audit.history.data
      if (!historyData || !Array.isArray(historyData)) return

      // Find the most recent DCR change (history is sorted newest first)
      for (let index = 0; index < historyData.length; index++) {
        const entry = historyData[index]
        if (!entry.message) continue // message is indicator of a DCR mediated change

        const { dcrNumber, reason } = parseDCRMessage(entry.message)

        const entryDate = new Date(entry.updated)
        if (lastSignedAt && entryDate < new Date(lastSignedAt)) break

        const newValue = entry.c_value

        let oldValue = null

        for (let j = index + 1; j < Math.min(historyData.length, index + 1 + HISTORY_SCAN_LIMIT); j++) {
          const prev = historyData[j]
          if (prev.c_value !== undefined) {
            oldValue = prev.c_value
            break
          }
        }

        dcrItems.push({
          timestamp: entry.updated,
          dcrJiraId: dcrNumber, // the JIRA ID is not actually a JIRA, but duplicating here so we don't break things while we update the FE to use dcrNumber (TODO in AXONCONFIG-5187)
          dcrNumber: dcrNumber,
          activity: (stepResponse.c_task && stepResponse.c_task.c_name) || 'Unknown activity',
          question: (stepResponse.c_step && stepResponse.c_step.c_question) || 'Unknown screen',
          oldValue: resolveHistoryDisplayValue(oldValue, stepResponse),
          newValue: resolveHistoryDisplayValue(newValue, stepResponse),
          reason: reason
        })

        break // Only process the most recent DCR change per step response b/c history can be very long
      }
    })

    dcrItems.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    return dcrItems
  } catch (error) {
    logger.error('Error fetching DCR items from audit history', error)
    return []
  }
}

/**
 * Resolve display value for different step types from audit history
 *
 * Studio (AxonExporter) only creates three result types:
 * - text_choice: For VRS, image_choice (needs label mapping via c_text_choices)
 * - c_numeric: For NRS, NDE, EQVAS, VAS (display as-is)
 * - c_text: For date_time, text_input, and default (display as-is)
 *
 * @param {any} value - The raw value from history
 * @param {Object} stepResponse - The step response with expanded c_step
 * @returns {string|null} Human-readable display value
 */
function resolveHistoryDisplayValue(value, stepResponse) {
  if (value === null || value === undefined) return null

  const step = stepResponse.c_step || null
  const choices = (step && step.c_text_choices) || []

  if (step && step.c_type === 'text_choice' && choices.length > 0) {
    const choiceByValue = choices.reduce((acc, choice) => {
      if (choice && choice.c_value != null) acc[String(choice.c_value)] = choice.c_text
      return acc
    }, {})

    const mapValueToLabel = (v) => {
      const key = String(v)
      return Object.prototype.hasOwnProperty.call(choiceByValue, key) ? choiceByValue[key] : v
    }

    if (Array.isArray(value)) {
      return value.map(mapValueToLabel).join(', ')
    }
    return mapValueToLabel(value)
  }

  // Unlikely to happen, but cheaper to be defensive than to suffer a release cycle to fix a bug.
  if (Array.isArray(value)) {
    return value.join(', ')
  }

  return String(value)
}

module.exports = { PI_OVERSIGHT_STATUS, computeDueParticipants, buildReviewBundle, authorizePI, authorizeSiteUser, ensureEnabled, getOversightWindowStart, getValidatedStudyConfig, getDCRItems, canonicalizeJson, calculateParticipantStatus, listVisitEvents, parseDCRMessage }