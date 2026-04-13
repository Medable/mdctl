/*
 * Route: List all participants with PI oversight status
 * Returns participants grouped by status with pagination
 */

import req from 'request'
import { computeDueParticipants, authorizePI } from 'c_pi_oversight_lib'

const { siteId, studyId, status, participantId, participantNumber } = req.query

// Parse pagination params
const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20
const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0

authorizePI()

const result = computeDueParticipants({
  siteId,
  studyId,
  limit,
  skip,
  status,
  participantId,
  participantNumber
})

// computeDueParticipants returns an array with single element
const resultData = result[0] || { data: [], totalCount: 0, hasMore: false }

return {
  object: 'list',
  data: resultData.data || [],
  totalCount: resultData.totalCount || 0,
  hasMore: resultData.hasMore || false
}