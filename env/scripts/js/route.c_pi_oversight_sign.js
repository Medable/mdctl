/*
 * Route: Sign off on PI Oversight review
 */

import req from 'request'
import cache from 'cache'
import { sha256 } from 'crypto'
import { authorizePI, buildReviewBundle, getOversightWindowStart, canonicalizeJson, getDCRItems } from 'c_pi_oversight_lib'
import logger from 'logger'
import http from 'http'
import faults from 'c_fault_lib'
const { participantId, siteId, studyId, signedDataHash, iamEndpoint, iamToken, aiSummary, printedName } = req.body

// Step 1: Authorize PI
authorizePI()

// Step 2: Validate Required Fields
if (!participantId || !siteId || !studyId) {
  logger.error('PI Oversight sign-off failed: Missing required fields (participantId, siteId, or studyId)')
  faults.throw('axon.invalidArgument.piOversightRequiredFields')
}

if (!signedDataHash) {
  logger.error('PI Oversight sign-off failed: Missing signedDataHash')
  faults.throw('axon.invalidArgument.piOversightSignedDataHashRequired')
}

if (!iamEndpoint) {
  logger.error('PI Oversight sign-off failed: Missing iamEndpoint')
  faults.throw('axon.invalidArgument.piOversightIamEndpointRequired')
}

if (!aiSummary || typeof aiSummary !== 'string' || aiSummary.trim().length === 0) {
  logger.error('PI Oversight sign-off failed: Missing or invalid aiSummary')
  faults.throw('axon.invalidArgument.piOversightAiSummaryRequired')
}

if (!printedName || typeof printedName !== 'string' || printedName.trim().length === 0) {
  logger.error('PI Oversight sign-off failed: Missing or invalid printedName')
  faults.throw('axon.invalidArgument.piOversightPrintedNameRequired')
}

// Step 3: Verify IAM Token
if (!iamToken) {
  logger.error('PI Oversight sign-off failed: No IAM token provided')
  faults.throw('cortex.accessDenied.authenticationRequired')
}

let tokenData
try {
  const requestBody = JSON.stringify({ token: iamToken })
  const url = `${iamEndpoint}/v1/introspect`
  logger.info(`Calling IAM introspection: ${url}`)
  logger.info(`Request body length: ${requestBody.length}`)

  const introspectResponse = http.post(url, {
    headers: { 'Content-Type': 'application/json' },
    body: requestBody
  })

  if (introspectResponse.statusCode !== 200) {
    logger.error(`IAM introspection failed with status ${introspectResponse.statusCode}: ${introspectResponse.body}`)
    faults.throw('cortex.accessDenied.authenticationFailed')
  }

  tokenData = JSON.parse(introspectResponse.body)

  if (!tokenData.active) {
    logger.error('IAM token is inactive')
    faults.throw('cortex.accessDenied.tokenExpired')
  }
} catch (err) {
  logger.error(`Error calling IAM introspection: ${err.message || err}`)
  faults.throw('cortex.accessDenied.authenticationFailed')
}

// Validate Transaction Nonce (txn) from IAM token contains txn
if (!tokenData.txn) {
  logger.error('IAM token missing txn (transaction nonce)')
  faults.throw('axon.invalidArgument.piOversightTxnMissing')
}

// Step 4: Validate tokenData.txn against cached value (server-side validation)
const cacheKey = `pi_oversight:txn:${participantId}:${siteId}:${studyId}:${tokenData.txn}`
const cachedData = cache.get(cacheKey)

if (!cachedData) {
  logger.error(`PI Oversight sign-off failed: No cached txn found for key ${cacheKey}. Session may have expired.`)
  faults.throw('axon.invalidArgument.piOversightSessionExpired')
}

logger.info(`PI Oversight: txn validated successfully for participant ${participantId}`)

// Delete the cached txn to prevent replay attacks (single-use nonce)
// Done AFTER successfully validating the IAM token to prevent DoS
cache.del(cacheKey)
logger.info(`PI Oversight: Deleted cached txn for key ${cacheKey}`)

// Step 5: Get Signer email from IAM Token
const signer = tokenData.email || ''
if (!signer || signer.length === 0) {
  logger.error('Unable to determine signer from IAM token')
  faults.throw('axon.invalidArgument.piOversightSignerMissing')
}

// Step 6: Determine Signature Method
const signatureMethod = tokenData.loginMethod === 'sso' ? 'sso' : 'password'

// Step 7: Determine Review Window
const windowStart = getOversightWindowStart(participantId, siteId, studyId)
const windowEnd = new Date()

// Step 8: Verify Data Integrity (must match GET bundle hashing)
const serverBundle = buildReviewBundle({
  participantId,
  siteId,
  studyId,
  sinceUtc: windowStart
})

// Include DCR items and use identical hashing structure
const dcrItems = getDCRItems(participantId, siteId, windowStart)
const dataForHash = {
  participantId,
  responses: serverBundle.responses,
  visitEvents: serverBundle.visitEvents,
  dcrItems
}
const canonical = JSON.stringify(canonicalizeJson(dataForHash))
const serverHashHex = sha256(canonical)
const serverHash = `sha256:${serverHashHex}`

const normalizedClientHash = signedDataHash.startsWith('sha256:')
  ? signedDataHash
  : `sha256:${signedDataHash}`

if (serverHash !== normalizedClientHash) {
  logger.error(`Data hash mismatch. Expected: ${serverHash}, Received: ${normalizedClientHash}`)
  faults.throw('axon.invalidArgument.piOversightDataHashMismatch')
}

// Step 9: Create Sign-Off Audit Record (without signature first)
// Use lean(false) to return the created instance
const signoffRecord = org.objects.c_pi_oversight_signoff.insertOne({
  c_public_user: participantId,
  c_site: siteId,
  c_study: studyId,
  c_signed_by: script.principal._id,
  c_signed_at_utc: windowEnd,
  c_printed_name: printedName.trim(),
  c_signer_email: signer, // needed b/c trino only includes context collection and signature is in signature collection
  c_window_start: windowStart,
  c_window_end: windowEnd,
  c_signed_data_hash: signedDataHash,
  c_signature_method: signatureMethod,
  c_iam_session_id: tokenData.jti,
  c_iam_token_issued_at: new Date(tokenData.iat * 1000),
  c_ai_summary: aiSummary.trim()
})
  .lean(false)
  .skipAcl()
  .grant(consts.accessLevels.script)
  .execute()

// Step 10: Add Signature using $set (matching task response pattern)
const signatureObject = {
  signer,
  date: windowEnd.toISOString(),
  value: {
    participantId,
    signatureMethod,
    iamSessionId: tokenData.jti,
    signedDataHash
  }
}

// Signer email is copied here from signature to facilitate reporting using SQL API - setting both at the same time so that
org.objects.c_pi_oversight_signoff.updateOne(
  { _id: signoffRecord._id },
  { $set: { c_signatures: signatureObject } }
)
  .skipAcl()
  .grant(consts.accessLevels.update)
  .execute()

logger.info(`PI Oversight sign-off completed for participant ${participantId} by ${signer} via ${signatureMethod}`)

// Step 11: Return Success
return {
  participantId,
  signedAt: windowEnd.toISOString(),
  signatureMethod
}