import req from 'request'
import cache from 'cache'
import { sha256 } from 'crypto'
import { authorizeSiteUser, buildReviewBundle, getOversightWindowStart, getDCRItems, canonicalizeJson, calculateParticipantStatus } from 'c_pi_oversight_lib'
import logger from 'logger'

const { participantId, siteId, studyId } = req.query

authorizeSiteUser()

// Generate transaction nonce for binding this review to subsequent sign-off
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
const txn = generateUUID()

// Create cache key combining context and txn for namespace isolation and uniqueness
const cacheKey = `pi_oversight:txn:${participantId}:${siteId}:${studyId}:${txn}`

// Store txn in cache with 15-minute TTL (900 seconds)
const cacheTTL = 900
cache.set(cacheKey, { txn, createdAt: new Date().toISOString() }, cacheTTL)
logger.info(`PI Oversight: Stored txn in cache for participant ${participantId}, key: ${cacheKey}`)

// Find last signoff for this participant/site/study
// Determine window start (latest signoff or participant created)
const windowStart = getOversightWindowStart(participantId, siteId, studyId)

// Also fetch lastSignedAtUtc explicitly (null when never signed)
const lastSignArr = org.objects.c_pi_oversight_signoff
  .find({ c_public_user: participantId, c_site: siteId, c_study: studyId })
  .paths('c_signed_at_utc')
  .sort({ c_signed_at_utc: -1 })
  .skipAcl()
  .grant('read')
  .limit(1)
  .toArray()
const lastSignedAtUtc = (lastSignArr && lastSignArr.length && lastSignArr[0].c_signed_at_utc) || null

const bundle = buildReviewBundle({ participantId, siteId, studyId, sinceUtc: windowStart })

// Get DCR items (with safety checks built-in)
const dcrItems = getDCRItems(participantId, siteId, windowStart)

// Compute server hash of canonical bundle for integrity (includes both responses and DCR items)
const dataForHash = {
  participantId,
  responses: bundle.responses,
  visitEvents: bundle.visitEvents,
  dcrItems
}
const canonical = JSON.stringify(canonicalizeJson(dataForHash))
const serverHashHex = sha256(canonical)
const serverHash = `sha256:${serverHashHex}`

// Fetch participant details
const participant = org.objects.c_public_users
  .readOne({ _id: participantId })
  .paths(['_id', 'c_number'])
  .skipAcl()
  .grant('read')
  .execute()

// Calculate participant status (same logic as computeDueParticipants)
const status = calculateParticipantStatus({
  participantId,
  siteId,
  studyId
})

return {
  participantId,
  participantNumber: participant.c_number,
  lastSignedAtUtc,
  window: { start: windowStart, end: null },
  responses: bundle.responses,
  visitEvents: bundle.visitEvents,
  dcrItems,
  serverHash,
  status,
  txn
}